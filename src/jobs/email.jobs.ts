import type { EmailDeliveriesRepository } from '../features/email-deliveries/email-deliveries.repository.js';
import type { EmailSender } from '../infrastructure/email/emailSender.js';
import type { QueuedJob } from '../infrastructure/queue/jobs.js';
import { logger } from '../lib/logger.js';

/**
 * Envoi réel d'un e-mail mis en file. L'identifiant d'envoi sert de clé d'idempotence : une reprise
 * après une réponse perdue ne produit pas de second e-mail. Une erreur levée ici déclenche la reprise.
 * Chaque essai est suivi (10.3) ; le texte d'un e-mail sensible n'est jamais conservé.
 */
export const createSendEmailHandler =
  (sender: EmailSender, deliveries: EmailDeliveriesRepository, now: () => Date) =>
  async (jobs: Array<QueuedJob<'email.send'>>) => {
    for (const job of jobs) {
      const { deliveryId, to, subject, text, sensitive = false } = job.data;
      await deliveries.startAttempt({ id: deliveryId, to, subject, text: sensitive ? null : text, sensitive });
      try {
        await sender.send({ to, subject, text }, { idempotencyKey: deliveryId });
      } catch (err) {
        await deliveries.markError(deliveryId, err instanceof Error ? err.message : 'Erreur inconnue');
        throw err;
      }
      await deliveries.markSent(deliveryId, now());
    }
  };

/**
 * Échec définitif après toutes les reprises : marqué pour l'équipe (écran de suivi et alerte), et journalisé au
 * niveau error pour la supervision. Le destinataire n'est pas journalisé.
 */
export const createDeadEmailHandler =
  (deliveries: EmailDeliveriesRepository) => async (jobs: Array<QueuedJob<'email.send'>>) => {
    for (const job of jobs) {
      logger.error(
        { deliveryId: job.data.deliveryId, subject: job.data.subject },
        'E-mail abandonné après toutes les reprises',
      );
      await deliveries.markFailed(job.data.deliveryId);
    }
  };
