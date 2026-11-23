import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock, deliverOrder } from '../../../tests/factories.js';
import { returnRefundAmount } from '../returns/returns.rules.js';
import type { ReturnActor } from './staff-returns.service.js';

const owner: ReturnActor = { id: 's0', role: 'super_admin', extraRoles: [], customPermissions: [] };
const ordersManager: ReturnActor = { id: 's1', role: 'orders_manager', extraRoles: [], customPermissions: [] };
const cashier = { ...ordersManager, refundLimit: 100_000 };
const DAY = 24 * 60 * 60_000;

/** Commande de 2 pagnes à 10 000 FCFA, livrée et payée en espèces (total 22 000 avec 2 000 de livraison). */
async function deliveredOrder({ pay = true } = {}) {
  const clock = createClock();
  const shop = buildShopServices(clock);
  const category = shop.catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const zone = shop.catalog.addZone({ fee: 2_000 });
  const product = shop.catalog.addProduct({ slug: 'pagne', name: 'Pagne', categoryId: category.id }, [
    { price: 10_000, stock: 10 },
  ]);
  const variant = product.variants[0]!;
  const { order } = await shop.orders.place(
    {
      idempotencyKey: randomUUID(),
      lines: [{ variantId: variant.id, quantity: 2 }],
      delivery: {
        recipient: 'Awa Ndong',
        phone: '077123456',
        email: 'awa@example.ga',
        zoneId: zone.id,
        landmark: 'Face à la pharmacie',
      },
      paymentMethod: 'cash',
    },
    'client-a',
  );
  await deliverOrder(shop, order.id, ordersManager);
  if (pay)
    await shop.staffPayments.record(order.id, { amount: 22_000, receivedAt: clock.now(), reference: null }, cashier);
  const request = (
    quantity = 2,
    reason: 'Produit endommagé' | 'Erreur de taille ou de variante' = 'Erreur de taille ou de variante',
  ) =>
    shop.returns.request('client-a', order.id, {
      items: [{ variantId: variant.id, quantity }],
      reason,
      comment: '',
      evidenceUrls: [],
    });
  return { ...shop, clock, order, variant, request };
}

describe('règles des retours', () => {
  it('rembourse le prix payé des articles, remises réparties au prorata, hors livraison', () => {
    const order = {
      items: [
        { variantId: 'a', unitPrice: 10_000 },
        { variantId: 'b', unitPrice: 30_000 },
      ],
      totals: { subtotal: 40_000, codeDiscount: 4_000, pointsDiscount: 0 },
    } as Parameters<typeof returnRefundAmount>[0];
    expect(returnRefundAmount(order, [{ variantId: 'a', quantity: 1 }])).toBe(9_000);
  });
});

describe('demande de retour', () => {
  it('accepte une demande sur une commande livrée, dans le délai', async () => {
    const { request } = await deliveredOrder();
    expect(await request()).toMatchObject({ status: 'pending', items: [{ quantity: 2 }] });
  });

  it('refuse hors délai, au-delà de la quantité achetée, sans justificatif ou en double', async () => {
    const { request } = await deliveredOrder();
    await expect(request(3)).rejects.toMatchObject({ status: 422 });
    await expect(request(1, 'Produit endommagé')).rejects.toMatchObject({ status: 422 });
    await request(1);
    await expect(request(1)).rejects.toMatchObject({ status: 409 });
    const late = await deliveredOrder();
    late.clock.advance(15 * DAY);
    await expect(late.request()).rejects.toMatchObject({ status: 409, message: expect.stringContaining('14 jours') });
  });

  it('refuse un retour sur une commande pas encore livrée', async () => {
    const shop = buildShopServices();
    const category = shop.catalog.addCategory({ slug: 'c', name: 'C' });
    const zone = shop.catalog.addZone();
    const product = shop.catalog.addProduct({ slug: 'p', name: 'P', categoryId: category.id }, [
      { price: 1_000, stock: 5 },
    ]);
    const { order } = await shop.orders.place(
      {
        idempotencyKey: randomUUID(),
        lines: [{ variantId: product.variants[0]!.id, quantity: 1 }],
        delivery: {
          recipient: 'Awa Ndong',
          phone: '077123456',
          email: 'a@example.ga',
          zoneId: zone.id,
          landmark: 'Pharmacie',
        },
        paymentMethod: 'cash',
      },
      'client-a',
    );
    await expect(
      shop.returns.request('client-a', order.id, {
        items: [{ variantId: product.variants[0]!.id, quantity: 1 }],
        reason: 'Autre motif',
        comment: '',
        evidenceUrls: [],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('traitement d’un retour', () => {
  it('réserve la décision à l’administrateur principal', async () => {
    const { request, staffReturns } = await deliveredOrder();
    const ret = await request();
    await expect(
      staffReturns.decide(ret.id, { status: 'refused', decisionReason: 'Article porté' }, ordersManager),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('suit le parcours simple : accepté, reçu puis remboursé', async () => {
    const { request, staffReturns, staffPayments, order, clock } = await deliveredOrder();
    const ret = await request();
    const accepted = await staffReturns.decide(
      ret.id,
      {
        status: 'accepted',
        decisionReason: 'Erreur de taille confirmée',
        shippingPaidBy: 'shop',
        shippingReason: 'Erreur de la boutique',
      },
      owner,
    );
    expect(accepted).toMatchObject({ status: 'expected', shippingPaidBy: 'shop' });

    // Aucun remboursement avant réception
    await expect(
      staffPayments.refund(
        order.id,
        {
          amount: 1_000,
          method: 'cash',
          refundedAt: clock.now(),
          reference: 'RB',
          noReferenceReason: null,
          clientAgreed: false,
        },
        cashier,
      ),
    ).rejects.toMatchObject({ status: 409 });

    await staffReturns.receive(ret.id, ordersManager);
    const received = await staffReturns.receive(ret.id, ordersManager);
    expect(received).toMatchObject({ status: 'refund_due', refundAmount: 20_000 });

    const refund = {
      method: 'cash' as const,
      refundedAt: clock.now(),
      reference: 'RB-1',
      noReferenceReason: null,
      clientAgreed: false,
    };
    await expect(staffPayments.refund(order.id, { ...refund, amount: 22_000 }, cashier)).rejects.toMatchObject({
      status: 422,
    });
    const refunded = await staffPayments.refund(order.id, { ...refund, amount: 20_000 }, cashier);
    // Retour partiel de la commande (la livraison reste payée) : la commande redevient « Payée »
    expect(refunded.order.paymentStatus).toBe('paid');
    expect(await staffReturns.get(ret.id, owner)).toMatchObject({ status: 'refunded', refundedAmount: 20_000 });
  });

  it('rouvre un dossier refusé dans le délai, pas au-delà', async () => {
    const { request, staffReturns, returns, order, clock } = await deliveredOrder();
    const ret = await request();
    await staffReturns.decide(ret.id, { status: 'refused', decisionReason: 'Délai d’essai dépassé' }, owner);
    const reopened = await returns.reopen('client-a', order.id, 'Le produit était défectueux dès l’ouverture');
    expect(reopened.status).toBe('pending');
    expect(reopened.history.map((h) => h.status)).toEqual(['pending', 'refused', 'pending']);
    await staffReturns.decide(ret.id, { status: 'refused', decisionReason: 'Refus confirmé' }, owner);
    clock.advance(15 * DAY);
    await expect(returns.reopen('client-a', order.id, 'Je conteste encore')).rejects.toMatchObject({ status: 409 });
  });
});
