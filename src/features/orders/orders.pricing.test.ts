import { describe, expect, it } from 'vitest';
import { priceOrder, type PricedLine, type PricingContext, type PromoRule } from './orders.pricing.js';

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
  startsAt: new Date('2026-11-01'),
  endsAt: new Date('2026-12-01'),
  maxUses: null,
  uses: 0,
  active: true,
  productIds: [],
  categoryIds: [],
  ...overrides,
});
const ctx = (overrides: Partial<PricingContext> = {}): PricingContext => ({
  deliveryFee: 2_000,
  promo: null,
  maxDiscountRate: 0.5,
  now,
  ...overrides,
});

describe('calcul de commande', () => {
  it('applique le code sur les articles hors promotion', () => {
    const totals = priceOrder(
      [line(), line({ productId: 'p2', unitPrice: 8_000, quantity: 1 })],
      ctx({ promo: promo() }),
    );
    expect(totals).toMatchObject({ subtotal: 28_000, productDiscount: 2_000, codeDiscount: 2_000, total: 28_000 });
  });

  it('limite la réduction au plafond configuré', () => {
    const totals = priceOrder([line()], ctx({ promo: promo({ value: 80 }) }));
    expect(totals).toMatchObject({ codeDiscount: 10_000, total: 12_000 });
  });

  it('vérifie les conditions du code', () => {
    const error = (rule: Partial<PromoRule>) => priceOrder([line()], ctx({ promo: promo(rule) })).codeError;
    expect(error({ endsAt: new Date('2026-11-02') })).toContain('plus valide');
    expect(error({ maxUses: 5, uses: 5 })).toContain('limite');
    expect(error({ minAmount: 50_000 })).toContain('50 000 FCFA');
    expect(error({ categoryIds: ['electronique'] })).toContain('éligible');
    expect(error({ categoryIds: ['mode'] })).toBeNull();
  });

  it('offre la livraison avec un code qui la prend en charge', () => {
    const totals = priceOrder([line()], ctx({ promo: promo({ type: 'fixed', value: 1_000, freeDelivery: true }) }));
    expect(totals).toMatchObject({ codeDiscount: 1_000, deliveryDiscount: 2_000, total: 19_000 });
  });
});