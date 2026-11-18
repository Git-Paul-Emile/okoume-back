import { paginate } from '../../core/http/apiResponse.js';
import { MIN_REDEEM, POINT_VALUE, tierFor, type Tier } from '../orders/orders.pricing.js';
import type { LoyaltyRepository } from './loyalty.repository.js';

/** Avantages affichés par niveau (12.4) ; ceux de livraison sont des offres ponctuelles, pas une gratuité permanente. */
export const TIER_PERKS: Record<Tier, { name: string; perks: string[] }> = {
  bronze: { name: 'Bronze', perks: ['Programme standard de points'] },
  argent: { name: 'Argent', perks: ['Programme standard de points', 'Codes promotionnels exclusifs'] },
  or: {
    name: 'Or',
    perks: ['Programme standard de points', 'Codes promotionnels exclusifs', 'Offres ponctuelles sur la livraison'],
  },
};

/** Côté client : solde, niveau, progression et historique des points (12.3, 12.4). */
export const createLoyaltyService = (loyalty: LoyaltyRepository) => ({
  async summary(customerId: string) {
    const [balance, spend, settings] = await Promise.all([
      loyalty.balance(customerId),
      loyalty.qualifyingSpend(customerId),
      loyalty.settings(),
    ]);
    const thresholds = { silver: settings.silverThreshold, gold: settings.goldThreshold };
    const tier = tierFor(spend, thresholds);
    const next =
      tier === 'bronze'
        ? { tier: 'argent' as const, threshold: thresholds.silver }
        : tier === 'argent'
          ? { tier: 'or' as const, threshold: thresholds.gold }
          : null;
    return {
      balance,
      balanceValue: Math.max(0, balance) * POINT_VALUE,
      // Un solde négatif bloque l'utilisation des points jusqu'à régularisation (12.3)
      redeemable: balance >= MIN_REDEEM,
      blocked: balance < 0,
      rules: { pointValue: POINT_VALUE, minRedeem: MIN_REDEEM },
      tier: { id: tier, ...TIER_PERKS[tier] },
      spend,
      next: next && {
        id: next.tier,
        name: TIER_PERKS[next.tier].name,
        threshold: next.threshold,
        remaining: next.threshold - spend,
      },
    };
  },

  async movements(customerId: string, page: { page: number; limit: number }) {
    const { items, total } = await loyalty.movements(customerId, page);
    return paginate(
      items.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
      total,
      page.page,
      page.limit,
    );
  },
});

export type LoyaltyService = ReturnType<typeof createLoyaltyService>;
