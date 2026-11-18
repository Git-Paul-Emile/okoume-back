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

/** E-mail au client quand les frais de livraison doivent changer (9.5) : rien ne change sans son accord. */
export const feeChangeEmail = (order: OrderRecord, toFee: number, reason: string, appUrl: string): EmailMessage => ({
  to: order.email,
  subject: `Commande ${order.number} : nouveaux frais de livraison à valider`,
  text: [
    `Bonjour ${order.recipient},`,
    '',
    `Les frais de livraison de votre commande ${order.number} doivent passer à ${fcfa(toFee)}.`,
    `Motif : ${reason}`,
    'La livraison reprendra dès votre réponse, depuis votre compte :',
    `${appUrl}/compte/commandes/${encodeURIComponent(order.number)}`,
  ].join('\n'),
});
