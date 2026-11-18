import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock } from '../../../tests/factories.js';
import type { PaymentActor } from './staff-payments.service.js';

const cashier: PaymentActor = {
  id: 's1',
  role: 'orders_manager',
  extraRoles: [],
  customPermissions: [],
  refundLimit: 50_000,
};
const owner: PaymentActor = { id: 's0', role: 'super_admin', extraRoles: [], customPermissions: [], refundLimit: null };
const catalogManager: PaymentActor = {
  id: 's2',
  role: 'catalog_manager',
  extraRoles: [],
  customPermissions: [],
  refundLimit: null,
};

async function setup(paymentMethod: 'cash' | 'airtel' | 'moov' = 'airtel', price = 10_000) {
  const clock = createClock();
  const shop = buildShopServices(clock);
  const category = shop.catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const zone = shop.catalog.addZone({ fee: 2_000 });
  const product = shop.catalog.addProduct({ slug: 'pagne', name: 'Pagne', categoryId: category.id }, [
    { price, stock: 10 },
  ]);
  const place = async () =>
    (
      await shop.orders.place(
        {
          idempotencyKey: randomUUID(),
          lines: [{ variantId: product.variants[0]!.id, quantity: 1 }],
          delivery: {
            recipient: 'Awa Ndong',
            phone: '077123456',
            email: 'awa@example.ga',
            zoneId: zone.id,
            landmark: 'Face à la pharmacie',
          },
          paymentMethod,
        },
        'client-a',
      )
    ).order;
  const order = await place();
  const receivedAt = shop.catalog.orders[0]!.createdAt;
  return { ...shop, clock, order, place, receivedAt };
}

describe('encaissements', () => {
  it('démarre en attente de paiement, même en Mobile Money', async () => {
    const { order } = await setup('airtel');
    expect(order.paymentStatus).toBe('awaiting_payment');
  });

  it('enregistre le total exact avec la référence Mobile Money', async () => {
    const { staffPayments, order, receivedAt } = await setup('airtel');
    const result = await staffPayments.record(
      order.id,
      { amount: 12_000, receivedAt, reference: 'AM-123456' },
      cashier,
    );
    expect(result).toMatchObject({ order: { paymentStatus: 'paid' }, paid: 12_000, due: 0, refundable: 12_000 });
    expect(result.payments[0]).toMatchObject({ kind: 'payment', method: 'airtel', reference: 'AM-123456' });
    expect(result.order.history.at(-1)?.note).toContain('Paiement reçu');
  });

  it('refuse un montant partiel, une référence manquante, une date future et un second encaissement', async () => {
    const { staffPayments, order, receivedAt, clock } = await setup('airtel');
    await expect(
      staffPayments.record(order.id, { amount: 6_000, receivedAt, reference: 'AM-1' }, cashier),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('aucun paiement partiel') });
    await expect(
      staffPayments.record(order.id, { amount: 12_000, receivedAt, reference: null }, cashier),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      staffPayments.record(
        order.id,
        { amount: 12_000, receivedAt: new Date(clock.now().getTime() + 3_600_000), reference: 'AM-1' },
        cashier,
      ),
    ).rejects.toMatchObject({ status: 422 });
    await staffPayments.record(order.id, { amount: 12_000, receivedAt, reference: 'AM-1' }, cashier);
    await expect(
      staffPayments.record(order.id, { amount: 12_000, receivedAt, reference: 'AM-2' }, cashier),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('bloque une référence déjà utilisée sur une autre commande (double paiement)', async () => {
    const { staffPayments, order, place, receivedAt } = await setup('moov');
    const other = await place();
    await staffPayments.record(order.id, { amount: 12_000, receivedAt, reference: 'MM-777' }, cashier);
    await expect(
      staffPayments.record(other.id, { amount: 12_000, receivedAt, reference: 'mm-777' }, cashier),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining(order.number) });
  });

  it('accepte les espèces sans référence et réserve l’encaissement aux personnes autorisées', async () => {
    const { staffPayments, order, receivedAt } = await setup('cash');
    await expect(
      staffPayments.record(order.id, { amount: 12_000, receivedAt, reference: null }, catalogManager),
    ).rejects.toMatchObject({ status: 403 });
    const result = await staffPayments.record(order.id, { amount: 12_000, receivedAt, reference: null }, cashier);
    expect(result.order.paymentStatus).toBe('paid');
  });

  it('garde annulée une commande payée après son annulation, avec un remboursement à faire', async () => {
    const { staffPayments, staffOrders, order, receivedAt } = await setup('airtel');
    await staffOrders.transition(order.id, { action: 'cancel', reason: 'Client injoignable' }, cashier);
    const result = await staffPayments.record(order.id, { amount: 12_000, receivedAt, reference: 'AM-9' }, cashier);
    expect(result.order).toMatchObject({ status: 'cancelled', paymentStatus: 'refund_due' });
  });
});

describe('remboursements', () => {
  async function paidThenCancelled(price = 10_000) {
    const shop = await setup('airtel', price);
    const total = price + 2_000;
    await shop.staffPayments.record(
      shop.order.id,
      { amount: total, receivedAt: shop.receivedAt, reference: 'AM-5' },
      cashier,
    );
    await shop.staffOrders.transition(shop.order.id, { action: 'cancel', reason: 'Rupture fournisseur' }, cashier);
    return { ...shop, total };
  }

  it('rembourse en plusieurs fois, « Remboursé » quand tout est rendu', async () => {
    const { staffPayments, order, receivedAt } = await paidThenCancelled();
    const first = await staffPayments.refund(
      order.id,
      {
        amount: 5_000,
        method: 'airtel',
        refundedAt: receivedAt,
        reference: 'RB-1',
        noReferenceReason: null,
        clientAgreed: false,
      },
      cashier,
    );
    expect(first).toMatchObject({ order: { paymentStatus: 'refund_due' }, refunded: 5_000, refundable: 7_000 });
    const second = await staffPayments.refund(
      order.id,
      {
        amount: 7_000,
        method: 'airtel',
        refundedAt: receivedAt,
        reference: 'RB-2',
        noReferenceReason: null,
        clientAgreed: false,
      },
      cashier,
    );
    expect(second.order.paymentStatus).toBe('refunded');
  });

  it('refuse plus que l’encaissé, un autre moyen sans accord et un montant au-delà du plafond', async () => {
    const { staffPayments, order, receivedAt } = await paidThenCancelled(60_000);
    const base = { refundedAt: receivedAt, reference: 'RB-1', noReferenceReason: null, clientAgreed: false };
    await expect(
      staffPayments.refund(order.id, { ...base, amount: 70_000, method: 'airtel' }, owner),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      staffPayments.refund(order.id, { ...base, amount: 1_000, method: 'cash' }, cashier),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('accord du client') });
    await expect(
      staffPayments.refund(order.id, { ...base, amount: 55_000, method: 'airtel' }, cashier),
    ).rejects.toMatchObject({ status: 403 });
    // L'administrateur principal n'a pas de plafond
    await expect(
      staffPayments.refund(order.id, { ...base, amount: 62_000, method: 'airtel' }, owner),
    ).resolves.toMatchObject({
      order: { paymentStatus: 'refunded' },
    });
  });

  it('refuse un remboursement sur une commande qui n’en attend pas', async () => {
    const { staffPayments, order, receivedAt } = await setup('airtel');
    await expect(
      staffPayments.refund(
        order.id,
        {
          amount: 1_000,
          method: 'airtel',
          refundedAt: receivedAt,
          reference: 'RB',
          noReferenceReason: null,
          clientAgreed: false,
        },
        cashier,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('changement de moyen de paiement par le client', () => {
  it('change le moyen tant que rien n’est encaissé, et le trace', async () => {
    const { payments, order } = await setup('airtel');
    const changed = await payments.changeMethod('client-a', order.id, 'cash');
    expect(changed.paymentMethod).toBe('cash');
    expect(changed.history.at(-1)?.note).toContain('Airtel Money remplacé par Espèces');
    await expect(payments.changeMethod('client-a', order.id, 'cash')).rejects.toMatchObject({ status: 422 });
  });

  it('refuse après encaissement ou pour la commande d’un autre client', async () => {
    const { payments, staffPayments, order, receivedAt } = await setup('cash');
    await expect(payments.changeMethod('client-b', order.id, 'moov')).rejects.toMatchObject({ status: 404 });
    await staffPayments.record(order.id, { amount: 12_000, receivedAt, reference: null }, cashier);
    await expect(payments.changeMethod('client-a', order.id, 'moov')).rejects.toMatchObject({ status: 409 });
  });
});
