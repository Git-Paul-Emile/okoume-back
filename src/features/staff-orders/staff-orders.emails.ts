import { fcfa } from '../../core/text/fcfa.js';
import type { EmailMessage } from '../../infrastructure/email/emailSender.js';
import type { OrderRecord } from '../orders/orders.repository.js';
import type { CourierRecord } from '../staff-couriers/staff-couriers.repository.js';

/** E-mail au livreur affecté (9.4) : de quoi récupérer et remettre le colis, et ce qu'il faut encaisser. */
export const courierAssignmentEmail = (
  order: OrderRecord,
  courier: CourierRecord & { email: string },
): EmailMessage => ({
  to: courier.email,
  subject: `Course ${order.number} : ${order.zoneName}`,
  text: [
    `Bonjour ${courier.firstName},`,
    '',
    `Une course vous est confiée : commande ${order.number}.`,
    `Client : ${order.recipient}, ${order.phone}`,
    `Adresse : ${order.zoneName}, ${order.landmark}`,
    ...(order.instructions ? [`Consignes : ${order.instructions}`] : []),
    `Articles : ${order.items.reduce((s, i) => s + i.quantity, 0)}`,
    order.paymentStatus === 'paid' ? 'Déjà payée : rien à encaisser.' : `À encaisser : ${fcfa(order.totals.total)}.`,
    '',
    'Merci de confirmer la livraison à la boutique dès la remise du colis.',
  ].join('\n'),
});

/** Une course et un encaissement pour les arrêts centralisés d'un même panier. */
export const courierRouteAssignmentEmail = (
  orders: readonly OrderRecord[],
  courier: CourierRecord & { email: string },
): EmailMessage => {
  const first = orders[0];
  if (!first) throw new Error('Une tournée doit contenir au moins une commande.');
  const due = orders.reduce((sum, order) => sum + order.totals.total, 0);
  return {
    to: courier.email,
    subject: `Collecte multi-boutiques ${first.checkoutNumber ?? first.number} : ${first.zoneName}`,
    text: [
      `Bonjour ${courier.firstName},`,
      '',
      `Une tournée vous est confiée pour le panier ${first.checkoutNumber ?? first.number}.`,
      ...orders.map((order, index) => {
        const shop = order.shop;
        const location = shop
          ? `${shop.name}, ${shop.district ?? ''}, ${shop.city ?? ''}, ${shop.phone ?? ''}`
          : 'Boutique officielle OKOZA : contacter l’équipe pour le point de collecte';
        return `${index + 1}. ${location} - commande ${order.number} - ${order.items.reduce((sum, item) => sum + item.quantity, 0)} article(s)`;
      }),
      '',
      `Client : ${first.recipient}, ${first.phone}`,
      `Adresse de livraison : ${first.zoneName}, ${first.landmark}`,
      ...(first.instructions ? [`Consignes : ${first.instructions}`] : []),
      `À encaisser une seule fois à la livraison : ${fcfa(due)} (${first.paymentMethod === 'cash' ? 'espèces' : first.paymentMethod === 'airtel' ? 'Airtel Money' : 'Moov Money'}).`,
    ].join('\n'),
  };
};

/** Une notification globale au client quand toutes les boutiques ont remis leurs produits. */
export const routeShippingEmail = (orders: readonly OrderRecord[], courier: CourierRecord): EmailMessage => {
  const first = orders[0];
  if (!first) throw new Error('Une tournée doit contenir au moins une commande.');
  const due = orders.reduce((sum, order) => sum + order.totals.total, 0);
  return {
    to: first.email,
    subject: `Votre panier ${first.checkoutNumber ?? first.number} est en cours de livraison`,
    text: [
      `Bonjour ${first.recipient},`,
      '',
      `Le livreur a récupéré tous les produits de votre panier ${first.checkoutNumber ?? first.number}.`,
      `Il vous les remettra en une seule livraison à ${first.zoneName}, ${first.landmark}.`,
      `Livreur : ${courier.firstName} ${courier.lastName}, ${courier.phone}`,
      `Total à régler une fois à la réception : ${fcfa(due)}.`,
    ].join('\n'),
  };
};

/** E-mail au client au départ du colis (9.4) : qui le livre et comment le joindre. */
export const shippingEmail = (order: OrderRecord, courier: CourierRecord): EmailMessage => ({
  to: order.email,
  subject: `Commande ${order.number} en cours de livraison`,
  text: [
    `Bonjour ${order.recipient},`,
    '',
    `Votre commande ${order.number} est en route.`,
    `Livreur : ${courier.firstName} ${courier.lastName}, ${courier.phone}`,
    order.paymentStatus === 'paid'
      ? 'Elle est déjà payée.'
      : `Montant à régler à la réception : ${fcfa(order.totals.total)}.`,
  ].join('\n'),
});
