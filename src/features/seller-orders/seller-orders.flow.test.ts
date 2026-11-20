import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock, deliverOrder } from '../../../tests/factories.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const cashier = { ...owner, refundLimit: null };

/** Une boutique de vendeur, un produit, et une commande passée par un client (32.4). */
async function setup() {
  const clock = createClock();
  const shop = buildShopServices(clock);
  const category = shop.catalog.addCategory({ slug: 'mode', name: 'Mode' });
  const zone = shop.catalog.addZone({ fee: 2_000 });
  const plan = await shop.staffShops.createPlan(
    {
      name: 'Accès gratuit',
      description: '',
      kind: 'free',
      price: 0,
      periodDays: null,
      trialDays: 0,
      active: true,
      position: 0,
    },
    owner,
  );
  const openShop = async (email: string, name: string) => {
    const seller = shop.shopsStore.addOwner({ email });
    const opened = await shop.shops.open(seller.id, {
      name,
      description: '',
      city: 'Libreville',
      district: 'Louis',
      position: null,
      phone: '077123456',
      acceptedPaymentMethods: ['cash'],
      handoverModes: ['pickup'],
      planId: plan.id,
    });
    return { seller, opened };
  };
  const { seller, opened } = await openShop('awa@example.ga', 'Pagnes d’Awa');
  const product = shop.catalog.addProduct(
    {
      slug: 'pagne',
      name: 'Pagne',
      categoryId: category.id,
      seller: { id: opened.id, slug: opened.slug, name: opened.name },
    },
    [{ price: 10_000, stock: 5 }],
  );
  const place = async (paymentMethod: 'cash' | 'airtel' = 'cash') =>
    (
      await shop.orders.place(
        {
          idempotencyKey: randomUUID(),
          lines: [{ variantId: product.variants[0]!.id, quantity: 2 }],
          delivery: {
            recipient: 'Paul Ndong',
            phone: '077654321',
            email: 'paul@example.ga',
            zoneId: zone.id,
            landmark: 'Face à la pharmacie',
          },
          paymentMethod,
        },
        null,
      )
    ).order;
  return { ...shop, clock, zone, seller, opened, openShop, place };
}

describe('commandes reçues par un vendeur', () => {
  it('le vendeur voit ses commandes, jamais celles d’une autre boutique', async () => {
    const { place, sellerOrders, seller, openShop } = await setup();
    const order = await place();
    expect((await sellerOrders.list(seller.id, { page: 1, limit: 20 })).items.map((o) => o.id)).toEqual([order.id]);
    const other = await openShop('jean@example.ga', 'Chez Jean');
    await expect(sellerOrders.get(other.seller.id, order.id)).rejects.toMatchObject({ status: 404 });
    expect((await sellerOrders.list(other.seller.id, { page: 1, limit: 20 })).items).toEqual([]);
  });

  it('un vendeur qui livre lui-même mène la commande jusqu’à l’encaissement', async () => {
    const { place, sellerOrders, sellerDelivery, seller, zone } = await setup();
    await sellerDelivery.save(seller.id, { mode: 'seller', fees: [{ zoneId: zone.id, fee: 1_000 }] });
    const order = await place('airtel');
    expect(order).toMatchObject({ fulfilledBy: 'seller', totals: { deliveryFee: 1_000, total: 21_000 } });

    await sellerOrders.advance(seller.id, order.id, undefined);
    await sellerOrders.advance(seller.id, order.id, undefined);
    await sellerOrders.advance(seller.id, order.id, undefined);
    expect(await sellerOrders.advance(seller.id, order.id, undefined)).toMatchObject({ status: 'delivered' });

    await expect(sellerOrders.collect(seller.id, order.id, { reference: null })).rejects.toMatchObject({ status: 422 });
    const paid = await sellerOrders.collect(seller.id, order.id, { reference: 'AM-VEND-0001' });
    expect(paid.paymentStatus).toBe('paid');
  });

  it('une commande livrée par Okoumé s’arrête chez le vendeur une fois prête', async () => {
    const { place, sellerOrders, seller, staffPushes } = await setup().then((s) => ({
      ...s,
      staffPushes: () => s.pushQueue.jobs.filter((j) => j.name === 'push.send'),
    }));
    const order = await place();
    await sellerOrders.advance(seller.id, order.id, undefined);
    expect(await sellerOrders.advance(seller.id, order.id, undefined)).toMatchObject({ status: 'ready' });
    await expect(sellerOrders.advance(seller.id, order.id, undefined)).rejects.toMatchObject({ status: 422 });
    expect(staffPushes().length).toBeGreaterThan(0);
  });

  it('l’encaissement par l’équipe crée le reversement dû au vendeur, commission déduite', async () => {
    const shop = await setup();
    shop.catalog.marketplace.commissionRate = 10;
    const order = await shop.place();
    await deliverOrder(shop, order.id, owner);
    await shop.staffPayments.record(
      order.id,
      { amount: 22_000, receivedAt: shop.clock.now(), reference: null },
      cashier,
    );

    const { items, due } = await shop.payouts.listForSeller(shop.seller.id, { page: 1, limit: 20 });
    // 22 000 encaissés, 2 000 de livraison gardés par Okoumé, 10 % de commission sur 20 000
    expect(items[0]).toMatchObject({ collected: 22_000, deliveryFee: 2_000, commission: 2_000, amount: 18_000 });
    expect(due).toBe(18_000);

    await expect(
      shop.payouts.markPaid(items[0]!.id, { method: 'airtel', reference: null }, owner),
    ).rejects.toMatchObject({ status: 422 });
    const paid = await shop.payouts.markPaid(items[0]!.id, { method: 'airtel', reference: 'AM-REV-0001' }, owner);
    expect(paid.status).toBe('paid');
    await expect(shop.payouts.markPaid(items[0]!.id, { method: 'cash', reference: null }, owner)).rejects.toMatchObject(
      { status: 409 },
    );
    expect((await shop.payouts.listForSeller(shop.seller.id, { page: 1, limit: 20 })).due).toBe(0);
  });

  it('le vendeur annule une commande avant son départ, le stock réservé est rendu', async () => {
    const { place, sellerOrders, seller, catalog } = await setup();
    const order = await place();
    const cancelled = await sellerOrders.cancel(seller.id, order.id, 'Rupture chez le fournisseur');
    expect(cancelled.status).toBe('cancelled');
    expect(catalog.products.find((p) => p.slug === 'pagne')!.variants[0]!.reserved).toBe(0);
  });

  it('un vendeur ne livre que les quartiers qu’il a choisis', async () => {
    const { sellerDelivery, seller } = await setup();
    await expect(sellerDelivery.save(seller.id, { mode: 'seller', fees: [] })).rejects.toMatchObject({ status: 422 });
    await expect(
      sellerDelivery.save(seller.id, { mode: 'seller', fees: [{ zoneId: randomUUID(), fee: 500 }] }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
