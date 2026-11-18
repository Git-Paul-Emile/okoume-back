import { randomUUID } from 'node:crypto';
import { createPromoCodeBody } from '../staff-promo-codes/staff-promo-codes.schemas.js';
import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock, deliverOrder } from '../../../tests/factories.js';

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
    { price: 10_000, stock: 50 },
  ]);
  const variant = product.variants[0]!;
  const place = (customerId: string | null, extra: { promoCode?: string; points?: number; quantity?: number } = {}) =>
    shop.orders.place(
      {
        idempotencyKey: randomUUID(),
        lines: [{ variantId: variant.id, quantity: extra.quantity ?? 2 }],
        delivery: {
          recipient: 'Awa Ndong',
          phone: '077123456',
          email: 'awa@example.ga',
          zoneId: zone.id,
          landmark: 'Face à la pharmacie',
        },
        paymentMethod: 'cash',
        ...(extra.promoCode ? { promoCode: extra.promoCode } : {}),
        ...(extra.points ? { points: extra.points } : {}),
      },
      customerId,
    );
  const deliverAndPay = async (orderId: string, total: number) => {
    await deliverOrder(shop, orderId, ordersManager);
    await shop.staffPayments.record(
      orderId,
      { amount: total, receivedAt: clock.now(), reference: null },
      ordersManager,
    );
  };
  const createCode = (overrides: Record<string, unknown> = {}) =>
    shop.staffPromoCodes.create(
      {
        code: 'bienvenue',
        label: 'Bienvenue',
        type: 'percent',
        value: 10,
        minAmount: 0,
        freeDelivery: false,
        newCustomersOnly: false,
        tiers: [],
        startsAt: new Date('2026-11-01'),
        endsAt: new Date('2026-12-31'),
        maxUses: null,
        perCustomer: null,
        active: true,
        customerId: null,
        productIds: [],
        categoryIds: [],
        ...overrides,
      },
      catalogManager,
    );
  return { ...shop, clock, variant, place, deliverAndPay, createCode };
}

describe('codes promo dans la commande', () => {
  it('applique le code calculé par l’API et compte son usage', async () => {
    const { place, createCode, catalog } = setup();
    const code = await createCode();
    expect(code.code).toBe('BIENVENUE');
    const { order } = await place('client-a', { promoCode: 'bienvenue' });
    expect(order).toMatchObject({ promoCode: 'BIENVENUE', totals: { codeDiscount: 2_000, total: 20_000 } });
    expect(catalog.promos[0]?.uses).toBe(1);
  });

  it('refuse un code inconnu ou hors limite, et l’annonce dans le devis sans bloquer', async () => {
    const { place, createCode, orders, catalog } = setup();
    await expect(place('client-a', { promoCode: 'INCONNU' })).rejects.toMatchObject({
      status: 422,
      code: 'PROMO_CODE_REJECTED',
    });
    await createCode({ perCustomer: 1 });
    await place('client-a', { promoCode: 'BIENVENUE' });
    await expect(place('client-a', { promoCode: 'BIENVENUE' })).rejects.toMatchObject({ status: 422 });
    await expect(place(null, { promoCode: 'BIENVENUE' })).rejects.toMatchObject({
      message: expect.stringContaining('Connectez-vous'),
    });
    const quote = await orders.quote(
      {
        lines: [{ variantId: catalog.products[0]!.variants[0]!.id, quantity: 1 }],
        zoneId: catalog.zones[0]!.id,
        promoCode: 'BIENVENUE',
      },
      'client-a',
    );
    expect(quote.totals.codeError).toContain('déjà utilisé');
  });

  it('libère l’usage du code quand la commande est annulée', async () => {
    const { place, createCode, staffOrders, catalog } = setup();
    await createCode({ maxUses: 1 });
    const { order } = await place('client-a', { promoCode: 'BIENVENUE' });
    await expect(place('client-b', { promoCode: 'BIENVENUE' })).rejects.toMatchObject({ status: 422 });
    await staffOrders.transition(order.id, { action: 'cancel', reason: 'Client injoignable' }, ordersManager);
    expect(catalog.promos[0]?.uses).toBe(0);
    await expect(place('client-b', { promoCode: 'BIENVENUE' })).resolves.toMatchObject({ created: true });
  });
});

describe('points de fidélité', () => {
  it('utilise les points sur la commande et les rend si elle est annulée', async () => {
    const { place, staffLoyalty, loyalty, staffOrders } = setup();
    await staffLoyalty.adjust('client-a', 500, 'Geste commercial', owner);
    const { order } = await place('client-a', { points: 200 });
    expect(order).toMatchObject({ pointsUsed: 200, totals: { pointsDiscount: 10_000, total: 12_000 } });
    expect((await loyalty.summary('client-a')).balance).toBe(300);
    await staffOrders.transition(order.id, { action: 'cancel', reason: 'Rupture fournisseur' }, ordersManager);
    expect((await loyalty.summary('client-a')).balance).toBe(500);
  });

  it('crédite les points une seule fois, après livraison et paiement, hors livraison', async () => {
    const { place, deliverAndPay, loyalty, staffOrders, catalog } = setup();
    const { order } = await place('client-a', { quantity: 3 });
    await deliverAndPay(order.id, 32_000);
    // 30 000 FCFA de produits : 30 points, la livraison ne compte pas
    expect((await loyalty.summary('client-a')).balance).toBe(30);
    await staffOrders.transition(order.id, { action: 'reopen', reason: 'Colis abîmé à vérifier' }, ordersManager);
    await staffOrders.transition(order.id, { action: 'advance' }, ordersManager);
    expect(catalog.loyaltyMovements.filter((m) => m.type === 'earn')).toHaveLength(1);
  });

  it('retire les points des articles retournés, solde négatif possible et bloquant', async () => {
    const {
      place,
      deliverAndPay,
      loyalty,
      returns,
      staffReturns,
      staffPayments,
      staffLoyalty,
      variant,
      orders,
      catalog,
      clock,
    } = setup();
    const { order } = await place('client-a', { quantity: 4 });
    await deliverAndPay(order.id, 42_000);
    expect((await loyalty.summary('client-a')).balance).toBe(40);
    const ret = await returns.request('client-a', order.id, {
      items: [{ variantId: variant.id, quantity: 2 }],
      reason: 'Erreur de taille ou de variante',
      comment: '',
      evidenceUrls: [],
    });
    await staffReturns.decide(
      ret.id,
      {
        status: 'accepted',
        decisionReason: 'Erreur confirmée',
        shippingPaidBy: 'shop',
        shippingReason: 'Erreur boutique',
      },
      owner,
    );
    await staffReturns.receive(ret.id, ordersManager);
    await staffReturns.inspect(
      ret.id,
      { outcome: 'conforming', lines: [{ variantId: variant.id, resaleable: 2, unsellable: 0 }], note: '' },
      ordersManager,
    );
    await staffPayments.refund(
      order.id,
      {
        amount: 20_000,
        method: 'cash',
        refundedAt: clock.now(),
        reference: 'RB-1',
        noReferenceReason: null,
        clientAgreed: false,
      },
      ordersManager,
    );
    expect((await loyalty.summary('client-a')).balance).toBe(20);

    // Correction négative au-delà du solde : solde négatif, utilisation des points bloquée
    await staffLoyalty.adjust('client-a', -50, 'Régularisation d’un doublon', owner);
    const summary = await loyalty.summary('client-a');
    expect(summary).toMatchObject({ balance: -30, blocked: true, redeemable: false });
    const quote = await orders.quote(
      { lines: [{ variantId: variant.id, quantity: 1 }], zoneId: catalog.zones[0]!.id, points: 100 },
      'client-a',
    );
    expect(quote.totals.pointsError).toContain('négatif');
  });
});

describe('niveaux et réglages', () => {
  it('calcule le niveau sur les achats nets et suit un changement de seuil', async () => {
    const { place, deliverAndPay, loyalty, staffLoyalty } = setup();
    const { order } = await place('client-a', { quantity: 30 });
    await deliverAndPay(order.id, 302_000);
    expect((await loyalty.summary('client-a')).tier.id).toBe('argent');
    await staffLoyalty.updateSettings({ silverThreshold: 400_000 }, owner);
    const summary = await loyalty.summary('client-a');
    expect(summary.tier.id).toBe('bronze');
    expect(summary.next).toMatchObject({ id: 'argent', remaining: 98_000 });
  });

  it('réserve corrections et réglages à l’administrateur principal', async () => {
    const { staffLoyalty } = setup();
    await expect(staffLoyalty.adjust('client-a', 100, 'Geste commercial', ordersManager)).rejects.toMatchObject({
      status: 403,
    });
    await expect(staffLoyalty.updateSettings({ goldThreshold: 100_000 }, owner)).rejects.toMatchObject({ status: 422 });
  });
});

describe('gestion des codes par l’équipe', () => {
  it('refuse un doublon et une limite sous les usages déjà faits', async () => {
    const { createCode, place, staffPromoCodes } = setup();
    const code = await createCode();
    await expect(createCode()).rejects.toMatchObject({ status: 409 });
    await place('client-a', { promoCode: 'BIENVENUE' });
    await place('client-b', { promoCode: 'BIENVENUE' });
    await expect(staffPromoCodes.update(code.id, { maxUses: 1 }, catalogManager)).rejects.toMatchObject({
      status: 422,
    });
    await expect(staffPromoCodes.update(code.id, { active: false }, ordersManager)).rejects.toMatchObject({
      status: 403,
    });
  });
  it('accepte un code de livraison offerte sans autre réduction, pas une réduction nulle', async () => {
    const { createCode, place, staffPromoCodes } = setup();
    const code = await createCode({ code: 'LIVRAISON', type: 'fixed', value: 0, freeDelivery: true });
    const { order } = await place('client-a', { promoCode: 'LIVRAISON' });
    expect(order.totals).toMatchObject({ codeDiscount: 0, deliveryDiscount: order.totals.deliveryFee });
    await expect(staffPromoCodes.update(code.id, { freeDelivery: false }, catalogManager)).rejects.toMatchObject({
      status: 422,
    });
    expect(
      createPromoCodeBody.safeParse({
        code: 'ZERO',
        label: 'Zéro',
        type: 'fixed',
        value: 0,
        startsAt: '2026-11-01',
        endsAt: '2026-12-01',
      }).success,
    ).toBe(false);
  });
});
