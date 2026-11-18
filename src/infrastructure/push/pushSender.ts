/**
 * Envoi de notifications push, dans le vocabulaire du métier (rules/10-stack/external-services.md).
 * Le code métier ne connaît ni le protocole Web Push ni la bibliothèque utilisée.
 */
export interface PushMessage {
  title: string;
  body: string;
  /** Page ouverte au clic sur la notification */
  url: string;
  /** Regroupe les notifications d'un même sujet : la plus récente remplace l'ancienne sur l'appareil */
  tag: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** « gone » : l'appareil s'est désabonné, l'abonnement est à supprimer. */
export type PushResult = 'sent' | 'gone';

export interface PushSender {
  /** Clé publique à donner au navigateur pour s'abonner */
  readonly publicKey: string;
  send(target: PushTarget, message: PushMessage, options: { urgent: boolean }): Promise<PushResult>;
}

/** Échec passager (service push indisponible, délai dépassé) : la file reprend l'envoi plus tard. */
export class PushDeliveryError extends Error {
  constructor(readonly statusCode: number | null) {
    super(`Notification push non remise (${statusCode ?? 'réseau'})`);
  }
}
