import {
  EMPTY_LEGAL,
  EMPTY_SUPPORT,
  type InformationRepository,
  type ShopInformationRecord,
} from '../src/features/settings/settings.repository.js';

/** Informations de la boutique en mémoire, avec les valeurs par défaut de la migration. */
export function createMemoryInformation() {
  const info: ShopInformationRecord = {
    mobileMoney: [],
    mobileMoneyExpiryHours: 24,
    support: { ...EMPTY_SUPPORT },
    social: {},
    legal: { ...EMPTY_LEGAL },
    supportSlaHigh: 4,
    supportSlaNormal: 24,
    alertEscalationHours: 4,
    reviewAmount: 500_000,
    cashPreparationAlertHours: 24,
    assistantMonthlyBudget: 0,
  };
  const repository: InformationRepository = {
    get: async () => structuredClone(info),
    update: async (patch) => structuredClone(Object.assign(info, patch)),
  };
  return { repository, info };
}
