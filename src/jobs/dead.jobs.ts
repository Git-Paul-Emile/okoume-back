import type { JobName, QueuedJob } from '../infrastructure/queue/jobs.js';
import { logger } from '../lib/logger.js';

/** Échec définitif d'un traitement planifié : alerte pour la supervision. */
export const createDeadJobHandler =
  <N extends JobName>(name: N) =>
  async (jobs: Array<QueuedJob<N>>) => {
    for (const job of jobs)
      logger.error({ jobId: job.id, job: name }, 'Traitement planifié abandonné après toutes les reprises');
  };
