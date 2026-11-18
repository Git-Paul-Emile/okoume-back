import type { Permission } from '../../core/security/permissions.js';
import type { EmailMessage } from '../email/emailSender.js';
import type { PushMessage } from '../push/pushSender.js';

/** Destinataires d'une notification push : un client pour un sujet donné, ou l'équipe qui a ce droit. */
export type PushAudience =
  { customerId: string; topic: 'orders' | 'support' | 'loyalty' | 'promotions' | 'shop' } | { permission: Permission };

/**
 * Catalogue des traitements différés : nom de la file et forme exacte des données de chaque job.
 * Ajouter un job, c'est ajouter une entrée ici ; le compilateur vérifie ensuite chaque envoi.
 */
export interface JobPayloads {
  /** deliveryId : attribué à la mise en file, clé d'idempotence chez le fournisseur et clé du suivi des envois */
  'email.send': EmailMessage & { deliveryId: string };
  /** Traitement quotidien des récompenses d'anniversaire (12.5) : aucune donnée, la date est celle du traitement */
  'loyalty.birthdays': Record<string, never>;
  /** Rappel quotidien des accès de boutique qui arrivent à échéance (32.2) : aucune donnée, la date est celle du traitement */
  'shops.access-reminders': Record<string, never>;
  /** Anonymisation quotidienne des comptes inactifs depuis 3 ans (19.5) : aucune donnée, la date est celle du traitement */
  'privacy.inactive-accounts': Record<string, never>;
  /** Détection des alertes de l'équipe (17.6), toutes les 15 minutes : aucune donnée, l'état est lu en base */
  'alerts.detect': Record<string, never>;
  /** Suppression quotidienne de l'historique de navigation de plus de 13 mois (19.5) : aucune donnée */
  'analytics.purge': Record<string, never>;
  /** Vérification assistée d'une annonce soumise (32.3) : la version évite d'appliquer l'avis à une annonce modifiée */
  'listings.review': { listingId: string; version: number };
  /** Réponse de l'assistant du tchat (32.5) au message de l'acheteur : une seule réponse par message */
  'chat.reply': { conversationId: string; messageId: string };
  /** Notification push (10.2, 10.3) : identifiant unique pour ne jamais la remettre deux fois au même appareil */
  'push.send': { notificationId: string; audience: PushAudience; message: PushMessage; urgent: boolean };
}

export type JobName = keyof JobPayloads;

/** Ce qu'un gestionnaire reçoit pour chaque job, quel que soit le moteur de file. */
export interface QueuedJob<N extends JobName> {
  id: string;
  data: JobPayloads[N];
}
