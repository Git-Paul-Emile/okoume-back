import { ForbiddenError } from '../../core/errors/AppError.js';
import { isOwner, type Grantee } from '../../core/security/permissions.js';
import type { LoyaltyRepository } from '../loyalty/loyalty.repository.js';
import { TIER_PERKS } from '../loyalty/loyalty.service.js';
import { EARN_PER, MIN_REDEEM, POINT_VALUE } from '../orders/orders.pricing.js';
import type { InformationRepository } from './settings.repository.js';
import type { UpdateInformationInput } from './settings.schemas.js';

export interface SettingsDependencies {
  information: InformationRepository;
  loyalty: Pick<LoyaltyRepository, 'settings'>;
  /** Délais des retours fixés par l'exploitant (RETURN_WINDOW_DAYS, RETURN_REOPEN_DAYS) */
  returnWindowDays: number;
  reopenWindowDays: number;
}

/**
 * Réglages de la boutique. La version publique ne contient que ce qu'un visiteur doit savoir : comment payer,
 * joindre l'assistance, les règles de fidélité et les délais. Les seuils internes restent réservés à l'équipe.
 */
export const createSettingsService = ({
  information,
  loyalty,
  returnWindowDays,
  reopenWindowDays,
}: SettingsDependencies) => ({
  async publicSettings() {
    const [info, rules] = await Promise.all([information.get(), loyalty.settings()]);
    return {
      currency: 'XAF' as const,
      loyalty: { pointValue: POINT_VALUE, minRedeem: MIN_REDEEM, earnPer: EARN_PER },
      maxDiscountRate: rules.maxDiscountRate,
      tiers: [
        { id: 'bronze' as const, threshold: 0, ...TIER_PERKS.bronze },
        { id: 'argent' as const, threshold: rules.silverThreshold, ...TIER_PERKS.argent },
        { id: 'or' as const, threshold: rules.goldThreshold, ...TIER_PERKS.or },
      ],
      mobileMoney: info.mobileMoney,
      mobileMoneyExpiryHours: info.mobileMoneyExpiryHours,
      returnWindowDays,
      reopenWindowDays,
      referralReward: rules.referralReward,
      welcomeCode: { enabled: rules.welcomeEnabled, percent: rules.welcomePercent, validDays: rules.welcomeValidDays },
      birthdayReward: { enabled: rules.birthdayEnabled, points: rules.birthdayPoints, percent: rules.birthdayPercent },
      deliveryVatRate: rules.deliveryVatRate,
      maxAddresses: rules.maxAddresses,
      supportSla: { high: info.supportSlaHigh, normal: info.supportSlaNormal },
      legal: info.legal,
      support: info.support,
      social: info.social,
    };
  },

  /** Toutes les informations, seuils internes compris : administrateur principal seulement. */
  async information(actor: Grantee) {
    if (!isOwner(actor)) throw new ForbiddenError('Réservé à l’administrateur principal.');
    return information.get();
  },

  async updateInformation(input: UpdateInformationInput, actor: Grantee) {
    if (!isOwner(actor)) throw new ForbiddenError('Réservé à l’administrateur principal.');
    return information.update(input);
  },
});

export type SettingsService = ReturnType<typeof createSettingsService>;
