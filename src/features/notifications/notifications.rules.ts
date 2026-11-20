import { fcfa } from '../../core/text/fcfa.js';
import type { PushMessage } from '../../infrastructure/push/pushSender.js';
import type { OrderStatus } from '../orders/orders.repository.js';

/** Sujets de notification du client (front/src/features/auth/components/NotificationPreferences.tsx). */
export const TOPICS = ['orders', 'support', 'loyalty', 'promotions', 'shop'] as const;
export type NotificationTopic = (typeof TOPICS)[number];
export type NotificationChannel = 'email' | 'push';

/**
 * Réglages par défaut, repris du front. Les e-mails de commande et d'assistance sont obligatoires : ils
 * restent le canal de référence (10.1) et ne se désactivent pas.
 */
export const DEFAULTS: Record<NotificationTopic, { email: boolean; push: boolean; emailLocked: boolean }> = {
  orders: { email: true, push: true, emailLocked: true },
  support: { email: true, push: true, emailLocked: true },
  loyalty: { email: true, push: false, emailLocked: false },
  promotions: { email: false, push: false, emailLocked: false },
  // Boutique du vendeur tiers (32.2) : paiements, échéances, suspension. L'e-mail reste obligatoire.
  shop: { email: true, push: true, emailLocked: true },
};

export type NotificationPrefs = Partial<Record<NotificationTopic, Partial<Record<NotificationChannel, boolean>>>>;

/** Lecture prudente des préférences enregistrées (JSON) : toute valeur inattendue est ignorée. */
export function parsePrefs(value: unknown): NotificationPrefs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const prefs: NotificationPrefs = {};
  for (const topic of TOPICS) {
    const entry: unknown = (value as Record<string, unknown>)[topic];
    if (!entry || typeof entry !== 'object') continue;
    const channels: Partial<Record<NotificationChannel, boolean>> = {};
    for (const channel of ['email', 'push'] as const) {
      const flag: unknown = (entry as Record<string, unknown>)[channel];
      if (typeof flag === 'boolean') channels[channel] = flag;
    }
    prefs[topic] = channels;
  }
  return prefs;
}

/** Réglage effectif d'un sujet et d'un canal, défauts compris ; l'e-mail obligatoire reste toujours actif. */
export function enabled(prefs: NotificationPrefs, topic: NotificationTopic, channel: NotificationChannel) {
  if (channel === 'email' && DEFAULTS[topic].emailLocked) return true;
  return prefs[topic]?.[channel] ?? DEFAULTS[topic][channel];
}

/** Vue complète des réglages, pour l'écran du compte. */
export const effectivePrefs = (prefs: NotificationPrefs) =>
  TOPICS.map((topic) => ({
    topic,
    email: enabled(prefs, topic, 'email'),
    push: enabled(prefs, topic, 'push'),
    emailLocked: DEFAULTS[topic].emailLocked,
  }));

const ORDER_MESSAGES: Partial<Record<OrderStatus, string>> = {
  preparing: 'est en préparation.',
  courier_assigned: 'a trouvé son livreur.',
  shipping: 'est en route : préparez-vous à la recevoir.',
  delivered: 'est livrée. Merci pour votre confiance !',
  cancelled: 'est annulée.',
};

/**
 * Message d'étape de commande (10.2), sans donnée personnelle (26) : le numéro de commande suffit au client.
 * null : étape sans notification.
 */
export function orderStatusMessage(order: { number: string }, status: OrderStatus, appUrl: string): PushMessage | null {
  const text = ORDER_MESSAGES[status];
  if (!text) return null;
  return {
    title: `Commande ${order.number}`,
    body: `Votre commande ${text}`,
    url: `${appUrl}/compte/commandes/${encodeURIComponent(order.number)}`,
    tag: `commande-${order.number}`,
  };
}

/** Alerte de l'équipe à chaque nouvelle commande : numéro et montant, sans les coordonnées du client. */
/** Nouvelle commande pour la boutique d'un vendeur (32.4) : elle se traite depuis son espace vendeur. */
export const sellerOrderMessage = (
  order: { number: string; totals: { total: number } },
  appUrl: string,
): PushMessage => ({
  title: 'Nouvelle commande pour votre boutique',
  body: `Commande ${order.number} : ${fcfa(order.totals.total)}`,
  url: `${appUrl}/vendeur/commandes`,
  tag: `commande-vendeur-${order.number}`,
});

export const newOrderMessage = (order: { number: string; totals: { total: number } }, appUrl: string): PushMessage => ({
  title: 'Nouvelle commande',
  body: `Commande ${order.number} : ${fcfa(order.totals.total)}`,
  url: `${appUrl}/admin/commandes`,
  tag: `nouvelle-commande-${order.number}`,
});
