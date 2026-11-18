import { describe, expect, it } from 'vitest';
import { priceOrder, tierFor, type PricedLine, type PricingContext, type PromoRule } from './orders.pricing.js';

const now = new Date('2026-11-04T10:00:00Z');
const line = (overrides: Partial<PricedLine> = {}): PricedLine => ({
  productId: 'p1',
  categoryIds: ['pagnes', 'mode'],
  unitPrice: 10_000,
  originalPrice: 10_000,
  quantity: 2,
  ...overrides,
});
const promo = (overrides: Partial<PromoRule> = {}): PromoRule => ({
  id: 'c1',
  code: 'BIENVENUE',
  type: 'percent',
  value: 10,
  minAmount: 0,
  freeDelivery: false,
  newCustomersOnly: false,
  tiers: [],
  startsAt: new Date('2026-11-01'),
  endsAt: new Date('2026-12-01'),
  maxUses: null,
  perCustomer: null,
  uses: 0,
  active: true,
  customerId: null,
  productIds: [],
  categoryIds: [],
  ...overrides,
});
const customer = { id: 'u1', isNew: false, tier: 'bronze' as const, codeUses: 0, pointsBalance: 500 };
const ctx = (overrides: Partial<PricingContext> = {}): PricingContext => ({
  deliveryFee: 2_000,
  promo: null,
  pointsRequested: 0,
  customer,
  maxDiscountRate: 0.5,
  now,
  ...overrides,
});

describe('calcul de commande', () => {
  it('applique le code sur les articles hors promotion, sans cumul', () => {
    const totals = priceOrder(
      [line(), line({ productId: 'p2', unitPrice: 8_000, quantity: 1 })],
      ctx({ promo: promo() }),
    );
    // 10 % de 20 000 (le second article est déjà en promotion)
    expect(totals).toMatchObject({ subtotal: 28_000, productDiscount: 2_000, codeDiscount: 2_000, total: 28_000 });
  });

  it('utilise les points par 50 FCFA, jamais sur la livraison, et calcule les points gagnés hors livraison', () => {
    const totals = priceOrder([line()], ctx({ pointsRequested: 200 }));
    expect(totals).toMatchObject({ pointsUsed: 200, pointsDiscount: 10_000, total: 12_000, pointsEarned: 10 });
  });

  it('plafonne le cumul des réductions', () => {
    const totals = priceOrder([line()], ctx({ promo: promo({ value: 40 }), pointsRequested: 500 }));
    // Plafond 50 % de 20 000 : code 8 000, il reste 2 000 pour les points, sous le minimum de 100 points
    expect(totals).toMatchObject({ codeDiscount: 8_000, pointsUsed: 0 });
    expect(totals.pointsError).toContain('plafond');
  });

  it('refuse les points sous le minimum, au-delà du solde ou avec un solde négatif', () => {
    expect(priceOrder([line()], ctx({ pointsRequested: 50 })).pointsError).toContain('au moins 100');
    expect(priceOrder([line()], ctx({ pointsRequested: 600 })).pointsError).toContain('500 points');
    expect(
      priceOrder([line()], ctx({ pointsRequested: 100, customer: { ...customer, pointsBalance: -20 } })).pointsError,
    ).toContain('négatif');
    expect(priceOrder([line()], ctx({ pointsRequested: 100, customer: null })).pointsError).toContain('Connectez-vous');
  });

  it('vérifie les conditions du code', () => {
    const error = (rule: Partial<PromoRule>, c: Partial<PricingContext> = {}) =>
      priceOrder([line()], ctx({ promo: promo(rule), ...c })).codeError;
    expect(error({ endsAt: new Date('2026-11-02') })).toContain('plus valide');
    expect(error({ maxUses: 5, uses: 5 })).toContain('limite');
    expect(error({ newCustomersOnly: true })).toContain('première commande');
    expect(error({ perCustomer: 1 }, { customer: { ...customer, codeUses: 1 } })).toContain('déjà utilisé');
    expect(error({ tiers: ['or'] })).toContain('Or');
    expect(error({ minAmount: 50_000 })).toContain('50 000 FCFA');
    expect(error({ categoryIds: ['electronique'] })).toContain('éligible');
    expect(error({ customerId: 'u2' })).toContain('personnel');
    expect(error({ perCustomer: 1 }, { customer: null })).toContain('Connectez-vous');
    expect(error({ categoryIds: ['mode'] })).toBeNull();
  });

  it('offre la livraison avec un code qui la prend en charge', () => {
    const totals = priceOrder([line()], ctx({ promo: promo({ type: 'fixed', value: 1_000, freeDelivery: true }) }));
    expect(totals).toMatchObject({ codeDiscount: 1_000, deliveryDiscount: 2_000, total: 19_000 });
  });

  it('classe le client selon ses achats nets', () => {
    const thresholds = { silver: 300_000, gold: 1_000_000 };
    expect(tierFor(299_999, thresholds)).toBe('bronze');
    expect(tierFor(300_000, thresholds)).toBe('argent');
    expect(tierFor(1_000_000, thresholds)).toBe('or');
  });
});
