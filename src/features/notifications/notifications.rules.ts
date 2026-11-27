import { fcfa } from '../../core/text/fcfa.js';
import type { OrderStatus } from '../orders/orders.repository.js';
import type { PushMessage } from './notifier.js';

const ORDER_MESSAGES: Partial<Record<OrderStatus, string>> = {
  preparing: 'est en préparation.',
  courier_assigned: 'a trouvé son livreur.',
  shipping: 'est en route : préparez-vous à la recevoir.',
  delivered: 'est livrée. Merci pour votre confiance !',
};

export function orderStatusMessage(order: { number: string }, status: OrderStatus, appUrl: string): PushMessage | null {
  const text = ORDER_MESSAGES[status];
  if (!text) return null;
  return {
    title: `Commande ${order.number}`,
    body: `Votre commande ${text}`,
    url: `${appUrl}/compte/commandes/${encodeURIComponent(order.number)}`,
  };
}

export const sellerOrderMessage = (
  order: { number: string; totals: { total: number } },
  appUrl: string,
): PushMessage => ({
  title: 'Nouvelle commande pour votre boutique',
  body: `Commande ${order.number} : ${fcfa(order.totals.total)}`,
  url: `${appUrl}/vendeur/commandes`,
});

export const newOrderMessage = (order: { number: string; totals: { total: number } }, appUrl: string): PushMessage => ({
  title: 'Nouvelle commande',
  body: `Commande ${order.number} : ${fcfa(order.totals.total)}`,
  url: `${appUrl}/admin/commandes`,
});
