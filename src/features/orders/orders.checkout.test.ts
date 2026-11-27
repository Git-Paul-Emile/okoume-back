import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock } from '../../../tests/factories.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };

/** Un panier avec un produit OKOZA et un produit d'une boutique de vendeur (32.4). */
async function setup() {
  const shop = buildShopServices(createClock());
  const { catalog } = shop;
  const category = catalog.addCategory({ slug: 'mode', name: 'Mode' });
  const zone = catalog.addZone();
  const seller = shop.shopsStore.addOwner({ email: 'awa@example.ga' });
  const opened = await shop.shops.open(seller.id, {
    name: 'Pagnes d’Awa',
    description: '',
    city: 'Libreville',
    district: 'Louis',
    position: null,
    phone: '077123456',
    acceptedPaymentMethods: ['cash'],
  });
  const okozaProduct = catalog.addProduct({ slug: 'casque', name: 'Casque', categoryId: category.id }, [
    { price: 20_000, stock: 5 },
  ]);
  const sellerProduct = catalog.addProduct(
    {
      slug: 'pagne',
      name: 'Pagne',
      categoryId: category.id,
      seller: { id: opened.id, slug: opened.slug, name: opened.name },
    },
    [{ price: 10_000, stock: 3 }],
  );
  const order = (overrides: Record<string, unknown> = {}) => ({
    idempotencyKey: randomUUID(),
    lines: [
      { variantId: okozaProduct.variants[0]!.id, quantity: 1 },
      { variantId: sellerProduct.variants[0]!.id, quantity: 2 },
    ],
    delivery: {
      recipient: 'Paul Ndong',
      phone: '077654321',
      email: 'paul@example.ga',
      zoneId: zone.id,
      landmark: 'Face à la pharmacie',
    },
    paymentMethod: 'cash' as const,
    ...overrides,
  });
  return { ...shop, zone, opened, seller, okozaProduct, sellerProduct, order };
}

describe('panier réparti par boutique', () => {
  it('un panier mixte donne une commande par boutique, reliées par le même passage en caisse', async () => {
    const { orders, order, opened, zone } = await setup();
    const placed = await orders.place(order(), null);
    expect(placed.created).toBe(true);
    expect(placed.orders).toHaveLength(2);
    const [okoza, seller] = placed.orders;
    expect(okoza).toMatchObject({ shop: null, fulfilledBy: 'okoza', totals: { subtotal: 20_000 } });
    expect(seller).toMatchObject({ shop: { name: expect.any(String) }, totals: { subtotal: 20_000 } });
    expect(okoza!.checkoutNumber).toMatch(/^PAN-/);
    expect(seller!.checkoutNumber).toBe(okoza!.checkoutNumber);
    expect(okoza!.number).not.toBe(seller!.number);
    // Chaque commande paie sa livraison, aux frais du quartier quand OKOZA livre
    expect(okoza!.totals.deliveryFee).toBe(zone.fee);
    expect(seller!.totals.deliveryFee).toBe(zone.fee);
    expect(opened.id).toBeTruthy();
  });

  it('un panier d’une seule boutique reste une seule commande, sans passage en caisse', async () => {
    const { orders, order, okozaProduct } = await setup();
    const placed = await orders.place(
      order({ lines: [{ variantId: okozaProduct.variants[0]!.id, quantity: 1 }] }),
      null,
    );
    expect(placed.orders).toHaveLength(1);
    expect(placed.order.checkoutNumber).toBeNull();
  });

  it('le rejeu de la même clé renvoie toutes les commandes du panier, sans doublon', async () => {
    const { orders, order } = await setup();
    const input = order();
    const first = await orders.place(input, null);
    const again = await orders.place(input, null);
    expect(again.created).toBe(false);
    expect(again.orders.map((o) => o.number)).toEqual(first.orders.map((o) => o.number));
  });

  it('un vendeur qui livre lui-même applique ses frais ; un quartier qu’il ne livre pas bloque la commande', async () => {
    const { orders, order, opened, zone, sellerTerms } = await setup();
    sellerTerms.sellerDelivers(opened.id, {});
    await expect(orders.place(order(), null)).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('ne livre pas'),
    });
    sellerTerms.sellerDelivers(opened.id, { [zone.id]: 500 });
    const placed = await orders.place(order(), null);
    expect(placed.orders[1]).toMatchObject({ fulfilledBy: 'seller', totals: { deliveryFee: 500 } });
  });

  it('le devis détaille chaque boutique : qui vend, qui livre et les frais', async () => {
    const { orders, order, zone } = await setup();
    const { lines } = order();
    const quote = await orders.quote({ lines, zoneId: zone.id }, null);
    expect(quote.shipments).toHaveLength(2);
    expect(quote.shipments[0]).toMatchObject({ shop: null, fulfilledBy: 'okoza', subtotal: 20_000 });
    expect(quote.shipments[1]).toMatchObject({ fulfilledBy: 'okoza', subtotal: 20_000 });
    expect(quote.totals.subtotal).toBe(40_000);
    expect(quote.totals.deliveryFee).toBe(zone.fee * 2);
  });

  it('un code promo ne s’applique qu’aux produits vendus par OKOZA', async () => {
    const { orders, order, sellerProduct } = await setup();
    const sellerOnly = order({
      lines: [{ variantId: sellerProduct.variants[0]!.id, quantity: 1 }],
      promoCode: 'BIENVENUE',
    });
    await expect(orders.place(sellerOnly, null)).rejects.toMatchObject({
      status: 422,
      message: 'Ce code s’applique aux produits vendus par OKOZA.',
    });
  });

  it('un stock insuffisant chez un vendeur n’enregistre aucune commande du panier', async () => {
    const { orders, order, sellerProduct, catalog } = await setup();
    await expect(
      orders.place(
        order({
          lines: [
            { variantId: catalog.products[0]!.variants[0]!.id, quantity: 1 },
            { variantId: sellerProduct.variants[0]!.id, quantity: 9 },
          ],
        }),
        null,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(catalog.orders).toHaveLength(0);
  });
});
