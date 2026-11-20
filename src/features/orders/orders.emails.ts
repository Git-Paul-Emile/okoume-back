import { fcfa } from '../../core/text/fcfa.js';
import type { EmailMessage } from '../../infrastructure/email/emailSender.js';
import type { OrderRecord } from './orders.repository.js';

/** Tous les paiements se font à la livraison, au livreur : en espèces ou par Mobile Money. */
const PAYMENT_LABEL: Record<OrderRecord['paymentMethod'], string> = {
  cash: 'en espèces, à la livraison',
  airtel: 'par Airtel Money, à la livraison',
  moov: 'par Moov Money, à la livraison',
};

export const orderConfirmationEmail = (order: OrderRecord, appUrl: string): EmailMessage => ({
  to: order.email,
  subject: `Commande ${order.number} confirmée`,
  text: [
    `Bonjour ${order.recipient},`,
    '',
    `Nous avons bien reçu votre commande ${order.number}.`,
    '',
    ...order.items.map((i) => `${i.quantity} x ${i.name} (${i.variantLabel}) : ${fcfa(i.unitPrice * i.quantity)}`),
    '',
    `Livraison (${order.zoneName}) : ${fcfa(order.totals.deliveryFee)}`,
    `Total : ${fcfa(order.totals.total)}`,
    `Paiement : ${PAYMENT_LABEL[order.paymentMethod]}`,
    '',
    `Suivre la commande : ${appUrl}/suivi?numero=${encodeURIComponent(order.number)}`,
    `Code de suivi : ${order.trackingCode}`,
  ].join('\n'),
});

/** Un seul e-mail de confirmation pour le passage en caisse, avec les sous-commandes regroupées par boutique. */
export const checkoutConfirmationEmail = (orders: readonly OrderRecord[], appUrl: string): EmailMessage => {
  const first = orders[0];
  if (!first) throw new Error('Un panier confirmé doit contenir au moins une commande.');
  const central = orders.filter((order) => order.fulfilledBy === 'okoume');
  const independent = orders.filter((order) => order.fulfilledBy === 'seller');
  const checkoutNumber = first.checkoutNumber ?? first.number;
  const centralTotal = central.reduce((sum, order) => sum + order.totals.total, 0);
  return {
    to: first.email,
    subject: `Panier ${checkoutNumber} confirmé`,
    text: [
      `Bonjour ${first.recipient},`,
      '',
      `Votre panier ${checkoutNumber} est confirmé.`,
      ...orders.flatMap((order) => [
        '',
        `${order.shop?.name ?? 'Boutique officielle OKOUMÉ'} - sous-commande ${order.number}`,
        ...order.items.map((item) => `${item.quantity} x ${item.name} (${item.variantLabel}) : ${fcfa(item.unitPrice * item.quantity)}`),
        `Total de la sous-commande : ${fcfa(order.totals.total)}`,
        order.fulfilledBy === 'okoume' ? 'Collecte et livraison par le livreur OKOUMÉ.' : 'Livraison organisée par la boutique.',
      ]),
      '',
      ...(central.length
        ? [`Les commandes centralisées sont remises en une seule livraison. Total à régler une fois : ${fcfa(centralTotal)}.`]
        : []),
      ...(independent.length ? ['Les commandes livrées par les boutiques se règlent séparément à leur livraison.'] : []),
      `Paiement : ${PAYMENT_LABEL[first.paymentMethod]}.`,
      '',
      `Suivre tout le panier : ${appUrl}/suivi?numero=${encodeURIComponent(checkoutNumber)}`,
      `Code de suivi : ${first.trackingCode}`,
    ].join('\n'),
  };
};
