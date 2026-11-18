import type { PromoCodesRepository } from './promo-codes.repository.js';

/** Codes promotionnels ouverts à tous (page Promotions) : ce qu'il faut pour les afficher, sans les compteurs. */
export const createPublicPromoCodesService = (promoCodes: PromoCodesRepository, now: () => Date) => ({
  async list() {
    return (await promoCodes.publicCodes(now())).map((p) => ({
      id: p.id,
      code: p.code,
      label: p.label,
      type: p.type,
      value: p.value,
      minAmount: p.minAmount,
      freeDelivery: p.freeDelivery,
      tiers: [...p.tiers],
      startsAt: p.startsAt.toISOString(),
      endsAt: p.endsAt.toISOString(),
    }));
  },
});

export type PublicPromoCodesService = ReturnType<typeof createPublicPromoCodesService>;
