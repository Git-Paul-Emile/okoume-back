import { AppError } from '../../core/errors/AppError.js';

/**
 * Envoi d'e-mails, dans le vocabulaire du métier (rules/10-stack/external-services.md).
 * Le code métier ne connaît jamais le fournisseur : il dépend de cette interface.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Contient parfois un lien d'accès : le texte n'est jamais conservé ni renvoyé. */
  sensitive?: boolean;
}

export interface SendOptions {
  /** Identifiant stable d'un envoi : un même envoi rejoué n'est délivré qu'une fois. */
  idempotencyKey?: string;
}

export interface EmailSender {
  send(message: EmailMessage, options?: SendOptions): Promise<void>;
}

/** Échec définitif d'un envoi, quel que soit le fournisseur : l'utilisateur peut réessayer plus tard. */
export class EmailDeliveryError extends AppError {
  constructor() {
    super('L’e-mail n’a pas pu être envoyé. Réessayez dans quelques minutes.', 503, 'EMAIL_UNAVAILABLE');
  }
}
