import type { ShopsService } from '../features/shops/shops.service.js';
import type { QueuedJob } from '../infrastructure/queue/jobs.js';
import { logger } from '../lib/logger.js';

/** Rappels d'échéance des boutiques (32.2). Une erreur levée ici déclenche la reprise ; rejouer ne double rien. */
export const createAccessRemindersHandler =
  (shops: ShopsService) => async (jobs: Array<QueuedJob<'shops.access-reminders'>>) => {
    // Le traitement porte sur la date du jour : un seul passage, même si plusieurs échéances arrivent ensemble
    if (!jobs.length) return;
    const sent = await shops.sendAccessReminders();
    logger.info({ sent }, 'Rappels d’échéance des boutiques envoyés');
  };
