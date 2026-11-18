import type { PrivacyService } from '../features/privacy/privacy.service.js';
import type { QueuedJob } from '../infrastructure/queue/jobs.js';
import { logger } from '../lib/logger.js';

/** Anonymisation des comptes inactifs (19.5). Une erreur levée ici déclenche la reprise ; rejouer ne double rien. */
export const createInactiveAccountsHandler =
  (privacy: PrivacyService) => async (jobs: Array<QueuedJob<'privacy.inactive-accounts'>>) => {
    // Le traitement porte sur la date du jour : un seul passage, même si plusieurs déclenchements arrivent ensemble
    if (!jobs.length) return;
    const result = await privacy.anonymizeInactive();
    logger.info(result, 'Comptes inactifs anonymisés');
  };
