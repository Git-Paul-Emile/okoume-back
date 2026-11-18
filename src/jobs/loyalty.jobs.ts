import type { JobName, QueuedJob } from '../infrastructure/queue/jobs.js';
import { logger } from '../lib/logger.js';
import type { LoyaltyRewardsService } from '../features/loyalty-rewards/loyalty-rewards.service.js';

/** Récompenses d'anniversaire du jour. Une erreur levée ici déclenche la reprise ; rejouer ne double rien. */
export const createBirthdaysHandler =
  (rewards: LoyaltyRewardsService) => async (jobs: Array<QueuedJob<'loyalty.birthdays'>>) => {
    // Le traitement porte sur la date du jour : un seul passage, même si plusieurs échéances arrivent ensemble
    if (jobs.length) await rewards.grantBirthdays();
  };

/** Échec définitif d'un traitement planifié : alerte au niveau error, pour la supervision. */
export const createDeadJobHandler =
  <N extends JobName>(name: N) =>
  async (jobs: Array<QueuedJob<N>>) => {
    for (const job of jobs)
      logger.error({ jobId: job.id, job: name }, 'Traitement planifié abandonné après toutes les reprises');
  };
