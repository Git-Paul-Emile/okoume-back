import type { PushDelivery } from '../features/notifications/notifications.service.js';
import type { QueuedJob } from '../infrastructure/queue/jobs.js';
import { logger } from '../lib/logger.js';

/** Remise des notifications push. Une erreur levée ici déclenche la reprise ; rejouer ne renvoie rien en double. */
export const createSendPushHandler = (deliver: PushDelivery) => async (jobs: Array<QueuedJob<'push.send'>>) => {
  for (const job of jobs) await deliver(job.data);
};

/**
 * Notification abandonnée après toutes les reprises : avertissement seulement, l'e-mail reste le canal de
 * référence (10.1). Ni destinataire ni contenu dans le journal.
 */
export const createDeadPushHandler = () => async (jobs: Array<QueuedJob<'push.send'>>) => {
  for (const job of jobs)
    logger.warn({ jobId: job.id, notificationId: job.data.notificationId }, 'Notification push abandonnée');
};
