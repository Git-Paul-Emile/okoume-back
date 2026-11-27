import type { EmailMessage } from '../../infrastructure/email/emailSender.js';
import type { PushMessage } from '../notifications/notifier.js';
import type { OwnerRecord, ShopRecord } from './shops.repository.js';

export interface SellerMessage {
  email: EmailMessage;
  push: PushMessage;
}

const shopUrl = (appUrl: string) => `${appUrl}/vendeur/boutique`;

export function suspensionMessage(owner: OwnerRecord, shop: ShopRecord, appUrl: string): SellerMessage {
  const suspended = shop.status === 'suspended';
  const body = suspended
    ? `Votre boutique « ${shop.name} » est suspendue : ${shop.suspensionReason ?? ''}. Ses produits ne sont plus visibles.`
    : `Votre boutique « ${shop.name} » est de nouveau active.`;
  return {
    email: {
      to: owner.email,
      subject: suspended ? 'Votre boutique est suspendue' : 'Votre boutique est réactivée',
      text: [`Bonjour ${owner.firstName},`, '', body, '', shopUrl(appUrl)].join('\n'),
    },
    push: {
      title: suspended ? 'Boutique suspendue' : 'Boutique réactivée',
      body: suspended ? 'Consultez le motif dans votre espace vendeur.' : 'Vos produits sont de nouveau visibles.',
      url: shopUrl(appUrl),
      tag: `boutique-statut-${shop.id}`,
    },
  };
}
