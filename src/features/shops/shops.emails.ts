import { fcfa } from '../../core/text/fcfa.js';
import type { EmailMessage } from '../../infrastructure/email/emailSender.js';
import type { PushMessage } from '../../infrastructure/push/pushSender.js';
import type { OwnerRecord, ShopPaymentRecord, ShopRecord } from './shops.repository.js';

/** Messages au vendeur tiers sur l'accès de sa boutique (32.2) : e-mail obligatoire, notification si activée. */

const date = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Africa/Libreville' }).format(d);

const shopUrl = (appUrl: string) => `${appUrl}/vendeur/boutique`;

export interface SellerMessage {
  email: EmailMessage;
  push: PushMessage;
}

export function paymentDecisionMessage(owner: OwnerRecord, payment: ShopPaymentRecord, appUrl: string): SellerMessage {
  const end = payment.status === 'validated' ? payment.periodEnd : null;
  const validated = end !== null;
  const body = end
    ? `Votre paiement de ${fcfa(payment.amount)} est validé : votre boutique est ouverte jusqu’au ${date(end)}.`
    : `Votre paiement de ${fcfa(payment.amount)} (référence ${payment.reference}) n’a pas pu être validé : ${payment.decisionReason ?? ''}`;
  return {
    email: {
      to: owner.email,
      subject: validated ? 'Paiement de votre boutique validé' : 'Paiement de votre boutique non validé',
      text: [`Bonjour ${owner.firstName},`, '', body, '', `Votre boutique : ${shopUrl(appUrl)}`].join('\n'),
    },
    push: {
      title: validated ? 'Paiement validé' : 'Paiement non validé',
      body: validated ? 'Votre boutique reste ouverte.' : 'Consultez le motif dans votre espace vendeur.',
      url: shopUrl(appUrl),
      tag: `boutique-paiement-${payment.id}`,
    },
  };
}

export function accessReminderMessage(owner: OwnerRecord, shop: ShopRecord, appUrl: string): SellerMessage {
  const ends = shop.accessEndsAt ? date(shop.accessEndsAt) : '';
  const what = shop.inTrial ? 'La période d’essai' : 'L’accès';
  return {
    email: {
      to: owner.email,
      subject: `${what} de votre boutique se termine le ${ends}`,
      text: [
        `Bonjour ${owner.firstName},`,
        '',
        `${what} de votre boutique « ${shop.name} » se termine le ${ends}.`,
        `Pour continuer, réglez l’offre « ${shop.plan.name} » (${fcfa(shop.plan.price)}) par Airtel Money ou Moov Money,`,
        'puis déclarez votre paiement dans votre espace vendeur.',
        '',
        'Après un court délai, vos annonces seront masquées, jamais supprimées, jusqu’au renouvellement.',
        '',
        shopUrl(appUrl),
      ].join('\n'),
    },
    push: {
      title: 'Votre boutique arrive à échéance',
      body: `${what} se termine le ${ends}.`,
      url: shopUrl(appUrl),
      tag: `boutique-echeance-${shop.id}`,
    },
  };
}

export function suspensionMessage(owner: OwnerRecord, shop: ShopRecord, appUrl: string): SellerMessage {
  const suspended = shop.status === 'suspended';
  const body = suspended
    ? `Votre boutique « ${shop.name} » est suspendue : ${shop.suspensionReason ?? ''}. Ses annonces ne sont plus visibles.`
    : `Votre boutique « ${shop.name} » est de nouveau active.`;
  return {
    email: {
      to: owner.email,
      subject: suspended ? 'Votre boutique est suspendue' : 'Votre boutique est réactivée',
      text: [`Bonjour ${owner.firstName},`, '', body, '', shopUrl(appUrl)].join('\n'),
    },
    push: {
      title: suspended ? 'Boutique suspendue' : 'Boutique réactivée',
      body: suspended ? 'Consultez le motif dans votre espace vendeur.' : 'Vos annonces sont de nouveau visibles.',
      url: shopUrl(appUrl),
      tag: `boutique-statut-${shop.id}`,
    },
  };
}
