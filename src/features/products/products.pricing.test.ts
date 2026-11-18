import { describe, expect, it } from 'vitest';
import { isPromotionActive, salePrice } from './products.pricing.js';

const now = new Date('2026-11-03T12:00:00Z');
const window = { startsAt: new Date('2026-11-01T00:00:00Z'), endsAt: new Date('2026-11-10T00:00:00Z') };

describe('prix de vente', () => {
  it('applique une remise en pourcentage arrondie au franc', () => {
    expect(salePrice(12_345, { type: 'percent', value: 10, ...window }, now)).toBe(11_111);
  });

  it('applique une remise fixe sans descendre sous zéro', () => {
    expect(salePrice(5_000, { type: 'fixed', value: 1_500, ...window }, now)).toBe(3_500);
    expect(salePrice(1_000, { type: 'fixed', value: 1_500, ...window }, now)).toBe(0);
  });

  it('ignore une promotion hors de sa période', () => {
    const past = {
      type: 'percent' as const,
      value: 50,
      startsAt: new Date('2026-10-01'),
      endsAt: new Date('2026-10-31'),
    };
    expect(isPromotionActive(past, now)).toBe(false);
    expect(salePrice(10_000, past, now)).toBe(10_000);
    expect(salePrice(10_000, null, now)).toBe(10_000);
  });
});
