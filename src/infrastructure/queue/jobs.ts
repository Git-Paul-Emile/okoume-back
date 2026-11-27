import type { EmailMessage } from '../email/emailSender.js';

/**
 * Catalogue des traitements différés : nom de la file et forme exacte des données de chaque job.
 * Ajouter un job, c'est ajouter une entrée ici ; le compilateur vérifie ensuite chaque envoi.
 */
export interface JobPayloads {
  /** deliveryId : attribué à la mise en file, clé d'idempotence chez le fournisseur et clé du suivi des envois */
  'email.send': EmailMessage & { deliveryId: string };
}

export type JobName = keyof JobPayloads;

/** Ce qu'un gestionnaire reçoit pour chaque job, quel que soit le moteur de file. */
export interface QueuedJob<N extends JobName> {
  id: string;
  data: JobPayloads[N];
}
