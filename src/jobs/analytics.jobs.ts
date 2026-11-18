import type { AnalyticsService } from '../features/analytics/analytics.service.js';
import type { QueuedJob } from '../infrastructure/queue/jobs.js';
import { logger } from '../lib/logger.js';

/** Suppression de l'historique de navigation échu (19.5). Rejouable sans effet en double. */
export const createAnalyticsPurgeHandler =
  (analytics: AnalyticsService) => async (jobs: Array<QueuedJob<'analytics.purge'>>) => {
    if (!jobs.length) return;
    logger.info(await analytics.purgeExpired(), 'Historique de navigation échu supprimé');
  };
