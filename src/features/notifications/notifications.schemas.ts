import { z } from 'zod';

/**
 * Services push des navigateurs : le worker envoie une requête à l'adresse fournie par le navigateur.
 * Seuls ces hôtes sont acceptés, pour qu'un abonnement forgé ne vise jamais le réseau interne (SSRF).
 */
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  '.notify.windows.com',
] as const;

const isPushService = (value: string) => {
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    !url.port &&
    PUSH_HOSTS.some((host) => (host.startsWith('.') ? url.hostname.endsWith(host) : url.hostname === host))
  );
};

const base64url = z
  .string()
  .min(16)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+=*$/, 'Clé d’abonnement invalide.');

const endpoint = z.url().max(1000).refine(isPushService, 'Service de notification non pris en charge.');

/**
 * Abonnement renvoyé par PushManager.subscribe() dans le navigateur (format standard PushSubscriptionJSON).
 * Non strict : le navigateur ajoute d'autres champs (expirationTime), ignorés car seuls ceux-ci sont lus.
 */
export const subscriptionBody = z.object({
  endpoint,
  keys: z.object({ p256dh: base64url, auth: base64url }),
});

export type SubscriptionInput = z.infer<typeof subscriptionBody>;

export const unsubscribeBody = z.strictObject({ endpoint });

const channels = z
  .strictObject({ email: z.boolean(), push: z.boolean() })
  .partial()
  .refine((c) => Object.keys(c).length > 0, { message: 'Aucun canal envoyé.' });

/** Réglages modifiés, par sujet ; les sujets absents gardent leur valeur. */
export const prefsBody = z
  .strictObject({ orders: channels, support: channels, loyalty: channels, promotions: channels, shop: channels })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Aucune modification envoyée.' });

export type PrefsInput = z.infer<typeof prefsBody>;
