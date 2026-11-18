import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import { logger } from '../../lib/logger.js';
import type { LoyaltyRepository } from '../loyalty/loyalty.repository.js';
import type { PromoCodesRepository } from '../promo-codes/promo-codes.repository.js';
import type { LoyaltyRewardsRepository, ReferralRewardRecord } from './loyalty-rewards.repository.js';
import { birthdaysOn } from './loyalty-rewards.rules.js';

const toReferralDto = (r: ReferralRewardRecord) => ({ ...r, createdAt: r.createdAt.toISOString() });

/** Parrainage, anniversaire et préférences du client (12.5). */
export const createLoyaltyRewardsService = (
  rewards: LoyaltyRewardsRepository,
  loyalty: LoyaltyRepository,
  promoCodes: PromoCodesRepository,
  now: () => Date,
) => ({
  /** Codes personnels utilisables (bienvenue, anniversaire), à montrer dans le compte du client. */
  async personalCodes(customerId: string) {
    return (await promoCodes.personalFor(customerId, now())).map((p) => ({
      code: p.code,
      label: p.label,
      type: p.type,
      value: p.value,
      endsAt: p.endsAt.toISOString(),
    }));
  },

  /** Code à partager et suivi des parrainages, pour le compte du client. */
  async referral(customerId: string) {
    const info = await rewards.referralInfo(customerId);
    if (!info) throw new NotFoundError('Compte introuvable.');
    const settings = await loyalty.settings();
    return { ...info, rewardPoints: settings.referralReward };
  },

  async updatePreferences(
    customerId: string,
    preferences: { birthDate?: Date | null | undefined; birthdayChoice?: 'points' | 'code' | undefined },
  ) {
    if (preferences.birthDate && preferences.birthDate > now())
      throw new UnprocessableError('La date d’anniversaire ne peut pas être dans le futur.');
    await rewards.updatePreferences(customerId, preferences);
  },

  /** Récompenses suspectes en attente de vérification humaine : droit clients:valider. */
  async listReferrals(
    query: { status?: ReferralRewardRecord['status'] | undefined; page: number; limit: number },
    actor: Grantee,
  ) {
    if (!can(actor, 'clients:valider')) throw new ForbiddenError();
    const { items, total } = await rewards.listReferrals(query);
    return paginate(items.map(toReferralDto), total, query.page, query.limit);
  },

  async decideReferral(id: string, grant: boolean, note: string, actor: Grantee & { id: string }) {
    if (!can(actor, 'clients:valider')) throw new ForbiddenError();
    if (!(await rewards.decideReferral(id, { grant, note, staffId: actor.id, at: now() })))
      throw new ConflictError('Cette récompense n’est plus en attente de vérification.');
  },

  /**
   * Traitement planifié du matin : récompense d'anniversaire des clients fêtés ce jour, points ou code selon
   * leur choix. Rejouable sans doublon (une récompense par client et par an).
   */
  async grantBirthdays() {
    const at = now();
    const settings = await loyalty.settings();
    if (!settings.birthdayEnabled) return { granted: 0 };
    const year = at.getUTCFullYear();
    const candidates = await rewards.birthdayCandidates(birthdaysOn(at), year);
    let granted = 0;
    for (const customer of candidates) {
      const done = await rewards.grantBirthday(
        customer,
        year,
        { points: settings.birthdayPoints, percent: settings.birthdayPercent, validDays: settings.birthdayValidDays },
        at,
      );
      if (done) granted += 1;
    }
    logger.info({ granted, candidates: candidates.length }, 'Récompenses d’anniversaire attribuées');
    return { granted };
  },
});

export type LoyaltyRewardsService = ReturnType<typeof createLoyaltyRewardsService>;
