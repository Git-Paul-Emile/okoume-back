import { logger } from '../../lib/logger.js';
import type { EmailMessage, EmailSender } from './emailSender.js';

/**
 * Développement uniquement : l'e-mail est écrit dans les logs au lieu d'être envoyé, pour lire les codes
 * de vérification en local. Refusé hors développement par la composition de l'application.
 */
export const devEmailSender: EmailSender = {
  async send(message: EmailMessage) {
    logger.info({ email: { to: message.to, subject: message.subject, body: message.text } }, 'E-mail (développement)');
  },
};
