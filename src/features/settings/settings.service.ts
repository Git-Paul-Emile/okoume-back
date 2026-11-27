import { ForbiddenError } from '../../core/errors/AppError.js';
import { isOwner, type Grantee } from '../../core/security/permissions.js';
import type { InformationRepository } from './settings.repository.js';
import type { UpdateInformationInput } from './settings.schemas.js';

export interface SettingsDependencies {
  information: InformationRepository;
}

/**
 * Réglages de la boutique. La version publique ne contient que ce qu'un visiteur doit savoir : comment payer,
 * joindre l'assistance et les délais.
 */
export const createSettingsService = ({ information }: SettingsDependencies) => ({
  async publicSettings() {
    const info = await information.get();
    return {
      currency: 'XAF' as const,
      mobileMoney: info.mobileMoney,
      mobileMoneyExpiryHours: info.mobileMoneyExpiryHours,
      deliveryVatRate: 18,
      maxAddresses: 5,
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
