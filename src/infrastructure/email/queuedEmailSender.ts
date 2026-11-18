import { randomUUID } from 'node:crypto';
import type { JobQueue } from '../queue/jobQueue.js';
import type { EmailSender } from './emailSender.js';

/**
 * Envoi différé : le service métier dépose l'e-mail dans la file et répond aussitôt.
 * Le worker l'envoie ensuite par le fournisseur, avec reprises, hors du cycle requête / réponse.
 */
export const createQueuedEmailSender = (queue: JobQueue): EmailSender => ({
  // Identifiant d'envoi stable d'une reprise à l'autre, même quand le job passe en file d'échec
  send: (message) => queue.send('email.send', { ...message, deliveryId: randomUUID() }),
});
