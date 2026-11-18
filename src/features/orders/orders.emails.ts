import { fcfa } from '../../core/text/fcfa.js';
import type { EmailMessage } from '../../infrastructure/email/emailSender.js';
import type { OrderRecord } from './orders.repository.js';

const PAYMENT_LABEL: Record<OrderRecord['paymentMethod'], string> = {
  cash: 'Espèces à la livraison',
  airtel: 'Airtel Money',
  moov: 'Moov Money',
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
