import { fcfa } from '../../core/text/fcfa.js';
import type { SellerMessage } from '../shops/shops.emails.js';
import type { RequestRecord } from './listing-requests.repository.js';

/**
 * Messages des demandes de commande (32.7). Le paiement se fait directement entre l'acheteur et le vendeur :
 * aucun message ne présente Okoumé comme intermédiaire du paiement.
 */

const PAYMENT_LABELS: Record<RequestRecord['paymentMethod'], string> = {
  cash: 'espèces',
  airtel: 'Airtel Money',
  moov: 'Moov Money',
};
const HANDOVER_LABELS: Record<RequestRecord['handover'], string> = {
  pickup: 'retrait sur place',
  seller_delivery: 'livraison par le vendeur',
};

const summary = (r: RequestRecord) =>
  `${r.quantity !== null ? `${r.quantity} × ` : ''}${r.listingTitle}, ${fcfa(r.total)}, ${PAYMENT_LABELS[r.paymentMethod]}, ${HANDOVER_LABELS[r.handover]}`;

function build(
  to: { email: string; firstName: string },
  url: string,
  request: RequestRecord,
  content: { subject: string; lines: string[]; title: string; body: string },
): SellerMessage {
  return {
    email: {
      to: to.email,
      subject: content.subject,
      text: [`Bonjour ${to.firstName},`, '', ...content.lines, '', url].join('\n'),
    },
    push: { title: content.title, body: content.body, url, tag: `demande-${request.number}` },
  };
}

const sellerUrl = (appUrl: string, r: RequestRecord) => `${appUrl}/vendeur/demandes/${r.id}`;
const buyerUrl = (appUrl: string, r: RequestRecord) => `${appUrl}/compte/demandes/${r.id}`;

export const newRequestMessage = (seller: { email: string; firstName: string }, r: RequestRecord, appUrl: string) =>
  build(seller, sellerUrl(appUrl, r), r, {
    subject: `Nouvelle demande de commande ${r.number}`,
    lines: [
      `${r.buyer.firstName} souhaite commander : ${summary(r)}.`,
      'Acceptez ou refusez-la depuis votre espace vendeur.',
    ],
    title: 'Nouvelle demande de commande',
    body: r.listingTitle,
  });

export const buyerCancelledMessage = (seller: { email: string; firstName: string }, r: RequestRecord, appUrl: string) =>
  build(seller, sellerUrl(appUrl, r), r, {
    subject: `Demande ${r.number} annulée par l’acheteur`,
    lines: [
      `La demande ${r.number} (${r.listingTitle}) a été annulée par l’acheteur.`,
      ...(r.reason ? [r.reason] : []),
    ],
    title: 'Demande annulée',
    body: r.listingTitle,
  });

/** Message à l'acheteur selon la décision du vendeur. */
export function buyerUpdateMessage(r: RequestRecord, appUrl: string) {
  const content = {
    accepted: {
      subject: `Votre demande ${r.number} est acceptée`,
      lines: [
        `${r.shop.name} accepte votre demande : ${summary(r)}.`,
        `Contactez le vendeur au ${r.shop.phone} pour convenir du paiement et de la remise.`,
        'Le paiement se fait directement avec le vendeur : Okoumé ne l’encaisse pas.',
      ],
      title: 'Demande acceptée',
    },
    refused: {
      subject: `Votre demande ${r.number} n’a pas été acceptée`,
      lines: [`${r.shop.name} ne peut pas donner suite à votre demande (${r.listingTitle}) : ${r.reason ?? ''}`],
      title: 'Demande refusée',
    },
    concluded: {
      subject: `Vente conclue : ${r.listingTitle}`,
      lines: [`${r.shop.name} indique que la vente est conclue. Merci d’avoir utilisé Okoumé.`],
      title: 'Vente conclue',
    },
    not_concluded: {
      subject: `Vente non conclue : ${r.listingTitle}`,
      lines: [`${r.shop.name} indique que la vente n’a pas pu se faire : ${r.reason ?? ''}`],
      title: 'Vente non conclue',
    },
  } as const;
  if (r.status !== 'accepted' && r.status !== 'refused' && r.status !== 'concluded' && r.status !== 'not_concluded')
    return null;
  const { subject, lines, title } = content[r.status];
  return build(r.buyer, buyerUrl(appUrl, r), r, { subject, lines: [...lines], title, body: r.listingTitle });
}
