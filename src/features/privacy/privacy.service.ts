import { logger } from '../../lib/logger.js';
import type { PrivacyRepository } from './privacy.repository.js';

/** Durée d'inactivité après laquelle les données de compte sont anonymisées automatiquement. */
export const INACTIVITY_YEARS = 3;
/** Reprise par lots pour éviter une transaction trop longue. */
const INACTIVE_BATCH = 200;

const yearsBefore = (at: Date, years: number) => {
  const date = new Date(at);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date;
};

/** Traitement de conservation uniquement; les demandes de correction personnelles ne sont plus prises en charge. */
export const createPrivacyService = (deps: { privacy: PrivacyRepository; now: () => Date }) => {
  const { privacy, now } = deps;

  return {
    async anonymizeInactive() {
      const at = now();
      const ids = await privacy.inactiveCustomers(yearsBefore(at, INACTIVITY_YEARS), INACTIVE_BATCH);
      let anonymized = 0;
      for (const id of ids) {
        if (await privacy.anonymize(id, at)) {
          logger.warn({ customerId: id }, 'Compte inactif non anonymisé : une commande ou un échange est encore en cours');
          continue;
        }
        anonymized++;
      }
      return { examined: ids.length, anonymized };
    },
  };
};

export type PrivacyService = ReturnType<typeof createPrivacyService>;
