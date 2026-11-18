import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { logger } from '../../lib/logger.js';
import { EmailDeliveryError, type EmailMessage, type EmailSender, type SendOptions } from './emailSender.js';

const ENDPOINT = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;
/** Pauses avant chaque nouvel essai : 3 essais au total. */
const RETRY_DELAYS_MS = [1_000, 3_000];

/** Erreurs que Resend indique comme passagères ; les autres demandent de corriger la requête ou le compte. */
const RETRYABLE_TYPES = new Set(['rate_limit_exceeded', 'concurrent_idempotent_requests', 'resource_locked']);

export interface ResendConfig {
  apiKey: string;
  from: string;
}

export interface ResendDependencies {
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<unknown>;
}

const errorTypeOf = async (response: Response): Promise<string | undefined> => {
  try {
    const body: unknown = await response.json();
    return body && typeof body === 'object' && 'type' in body && typeof body.type === 'string' ? body.type : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Adapter Resend (API HTTP, documentation : resend.com/docs/api-reference/emails/send-email).
 * Délai, reprises et traduction des erreurs restent ici (rules/10-stack/external-services.md).
 * Une même clé d'idempotence sert à tous les essais d'un message : Resend ne l'envoie qu'une fois,
 * même si une réponse s'est perdue après l'envoi. Depuis la file, la clé est l'identifiant du job :
 * elle reste la même d'une reprise du job à l'autre (valable 24 heures chez Resend).
 */
export const createResendEmailSender = (
  config: ResendConfig,
  { fetch, sleep }: ResendDependencies = { fetch: globalThis.fetch, sleep: wait },
): EmailSender => ({
  async send(message: EmailMessage, options?: SendOptions) {
    const idempotencyKey = options?.idempotencyKey ?? randomUUID();
    let failure: { status?: number; type?: string };

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 0);
      let retryable: boolean;
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({ from: config.from, to: message.to, subject: message.subject, text: message.text }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok) return;
        const type = await errorTypeOf(response);
        failure = { status: response.status, type };
        retryable = response.status >= 500 || (type !== undefined && RETRYABLE_TYPES.has(type));
      } catch {
        // Réseau coupé ou délai dépassé : l'e-mail a pu partir, la clé d'idempotence évite le doublon
        failure = { type: 'network' };
        retryable = true;
      }
      // Le destinataire n'est pas journalisé : c'est une donnée personnelle
      logger.warn({ provider: 'resend', attempt: attempt + 1, ...failure }, 'Échec d’envoi d’e-mail');
      if (!retryable) break;
    }
    throw new EmailDeliveryError();
  },
});
