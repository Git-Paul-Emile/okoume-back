import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock } from '../../../tests/factories.js';
import { ACCOUNT_HISTORY_MS } from '../orders/orders.service.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [], refundLimit: null };
const ordersManager = {
  id: 's1',
  role: 'orders_manager' as const,
  extraRoles: [],
  customPermissions: [],
  refundLimit: 1_000_000,
};
const catalogManager = { id: 's2', role: 'catalog_manager' as const, extraRoles: [], customPermissions: [] };

function setup() {
  const clock = createClock();
  const shop = buildShopServices(clock);
  const category = shop.catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const zone = shop.catalog.addZone({ fee: 2_000 });
  const product = shop.catalog.addProduct({ slug: 'pagne', name: 'Pagne', categoryId: category.id }, [
    { price: 11_800, stock: 50 },
  ]);
  const variant = product.variants[0]!;
  const place = async (customerId = 'client-a') =>
    (
      await shop.orders.place(
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
        customerId,
      )
    ).order;
  const pay = (orderId: string) =>
    shop.staffPayments.record(orderId, { amount: 25_600, receivedAt: clock.now(), reference: null }, ordersManager);
  return { ...shop, clock, variant, place, pay };
}

describe('émission des factures', () => {
  it('émet une facture à la confirmation du paiement, numérotée dans l’ordre', async () => {
    const { place, pay, invoices } = setup();
    const first = await place();
    const second = await place();
    await pay(first.id);
    await pay(second.id);
    const [invoice] = await invoices.forCustomerOrder('client-a', first.id);
    expect(invoice).toMatchObject({ number: 'FAC-2026-000001', type: 'invoice', totals: { ttc: 25_600 } });
    expect(invoice).not.toHaveProperty('customerId');
    expect(invoice!.totals.ht + invoice!.totals.vat).toBe(25_600);
    expect((await invoices.forCustomerOrder('client-a', second.id))[0]?.number).toBe('FAC-2026-000002');
  });

  it('n’émet pas de facture pour un paiement reçu après annulation', async () => {
    const { place, pay, invoices, staffOrders } = setup();
    const order = await place();
    await staffOrders.transition(order.id, { action: 'cancel', reason: 'Client injoignable' }, ordersManager);
    await pay(order.id);
    expect(await invoices.forCustomerOrder('client-a', order.id)).toEqual([]);
  });

  it('émet un avoir lié à la facture pour un remboursement, sans dépasser la facture', async () => {
    const { place, pay, invoices, staffOrders, staffPayments, clock } = setup();
    const order = await place();
    await pay(order.id);
    await staffOrders.transition(order.id, { action: 'cancel', reason: 'Rupture fournisseur' }, ordersManager);
    const refund = { method: 'cash' as const, refundedAt: clock.now(), noReferenceReason: null, clientAgreed: false };
    await staffPayments.refund(order.id, { ...refund, amount: 10_000, reference: 'RB-1' }, ordersManager);
    await staffPayments.refund(order.id, { ...refund, amount: 15_600, reference: 'RB-2' }, ordersManager);
    const docs = await invoices.forCustomerOrder('client-a', order.id);
    const credits = docs.filter((d) => d.type === 'credit_note');
    expect(credits.map((c) => c.number)).toEqual(['AV-2026-000001', 'AV-2026-000002']);
    expect(credits.every((c) => c.relatedNumber === 'FAC-2026-000001')).toBe(true);
    expect(credits.reduce((s, c) => s + c.totals.ttc, 0)).toBe(25_600);
  });

  it('garde le taux de TVA de la livraison d’une facture déjà émise', async () => {
    const { place, pay, invoices, staffLoyalty } = setup();
    const before = await place();
    await pay(before.id);
    await staffLoyalty.updateSettings({ deliveryVatRate: 10 }, owner);
    const after = await place();
    await pay(after.id);
    const rateOf = async (orderId: string) =>
      (await invoices.forCustomerOrder('client-a', orderId))[0]!.lines.find((l) => l.label.startsWith('Livraison'))
        ?.vatRate;
    expect(await rateOf(before.id)).toBe(18);
    expect(await rateOf(after.id)).toBe(10);
  });
});

describe('consultation des documents', () => {
  it('montre les documents au seul client de la commande, dans la fenêtre de son compte', async () => {
    const { place, pay, invoices, clock } = setup();
    const order = await place();
    await pay(order.id);
    await expect(invoices.forCustomerOrder('client-b', order.id)).rejects.toMatchObject({ status: 404 });
    clock.advance(ACCOUNT_HISTORY_MS + 1);
    await expect(invoices.forCustomerOrder('client-a', order.id)).rejects.toMatchObject({ status: 404 });
  });

  it('réserve la liste de l’équipe aux personnes autorisées aux paiements', async () => {
    const { place, pay, invoices } = setup();
    await pay((await place()).id);
    await expect(invoices.list({ page: 1, limit: 10 }, catalogManager)).rejects.toMatchObject({ status: 403 });
    const page = await invoices.list({ page: 1, limit: 10 }, ordersManager);
    expect(page).toMatchObject({ total: 1, items: [{ customerId: 'client-a' }] });
  });
});
