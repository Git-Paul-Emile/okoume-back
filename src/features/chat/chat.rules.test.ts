import { describe, expect, it } from 'vitest';
import { decideOffer, floorFrom, mentionsLowerPrice } from './chat.rules.js';

describe('règles de négociation', () => {
  it('calcule le prix minimum depuis un plancher ou une réduction maximale', () => {
    expect(floorFrom(50_000, { minPrice: 40_000 })).toBe(40_000);
    expect(floorFrom(50_000, { maxDiscountPercent: 15 })).toBe(42_500);
    expect(floorFrom(49_999, { maxDiscountPercent: 10 })).toBe(45_000);
    expect(floorFrom(50_000, { minPrice: null })).toBeNull();
  });

  it('accepte une offre au moins égale au minimum, jamais au-dessus du prix affiché', () => {
    expect(decideOffer(42_000, 40_000, 50_000)).toEqual({ accepted: true, price: 42_000 });
    expect(decideOffer(40_000, 40_000, 50_000)).toEqual({ accepted: true, price: 40_000 });
    expect(decideOffer(39_999, 40_000, 50_000)).toEqual({ accepted: false });
    expect(decideOffer(60_000, 40_000, 50_000)).toEqual({ accepted: true, price: 50_000 });
    // Sans négociation, seul le prix affiché passe
    expect(decideOffer(49_000, null, 50_000)).toEqual({ accepted: false });
  });

  it('repère un prix inférieur au prix affiché dans un texte, quelle que soit son écriture', () => {
    expect(mentionsLowerPrice('Je peux vous le faire à 45 000 FCFA.', 50_000)).toBe(true);
    expect(mentionsLowerPrice('Disons 45000 F.', 50_000)).toBe(true);
    expect(mentionsLowerPrice('Pour 45.000 francs, c’est bon.', 50_000)).toBe(true);
    expect(mentionsLowerPrice('Le prix est de 50 000 FCFA.', 50_000)).toBe(false);
    expect(mentionsLowerPrice('La table mesure 120 cm et pèse 15 kg, livrée 2 fois par semaine.', 50_000)).toBe(false);
  });
});
