import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
  ServiceUnavailableError,
} from '../../core/errors/AppError.js';
import type { MediaStorage } from '../../infrastructure/media/mediaStorage.js';
import type { Notifier } from '../notifications/notifier.js';
import type { OrdersRepository } from '../orders/orders.repository.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import { toReturnDto } from './returns.dto.js';
import type { ReturnsRepository } from './returns.repository.js';
import { assertReturnable, assertReturnItems, EVIDENCE_REQUIRED } from './returns.rules.js';
import type { ReturnRequestInput } from './returns.schemas.js';

const DAY_MS = 24 * 60 * 60_000;

export interface ReturnsDependencies {
  orders: OrdersRepository;
  returns: ReturnsRepository;
  /** Hébergement des photos justificatives ; null tant que Cloudinary n'est pas configuré */
  media: MediaStorage | null;
  windowDays: number;
  reopenDays: number;
  /** Vendeur prévenu d'un retour sur une de ses ventes (32.7) */
  shops: Pick<ShopsRepository, 'findById'>;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

/** Côté client : demande de retour, suivi du dossier, réouverture après un refus. */
export const createReturnsService = ({
  orders,
  returns,
  media,
  windowDays,
  reopenDays,
  shops,
  notifier,
  appUrl,
  now,
}: ReturnsDependencies) => {
  async function ownOrder(customerId: string, orderId: string) {
    const order = await orders.findForCustomer(orderId, customerId);
    if (!order) throw new NotFoundError('Commande introuvable.');
    return order;
  }

  async function ownReturn(customerId: string, orderId: string) {
    await ownOrder(customerId, orderId);
    const ret = await returns.findByOrder(orderId);
    if (!ret) throw new NotFoundError('Aucune demande de retour pour cette commande.');
    return ret;
  }

  return {
    /**
     * Autorisation d'envoyer une photo justificative, sur une commande du client encore retournable.
     * La photo part directement chez l'hébergeur ; seule son adresse est ensuite jointe à la demande.
     */
    async signEvidenceUpload(customerId: string, orderId: string) {
      assertReturnable(await ownOrder(customerId, orderId), now(), windowDays);
      if (!media) throw new ServiceUnavailableError('L’envoi de photos n’est pas encore configuré.');
      const upload = media.signUpload('returns', now());
      return { ...upload, expiresAt: upload.expiresAt.toISOString() };
    },

    async request(customerId: string, orderId: string, input: ReturnRequestInput) {
      const order = await ownOrder(customerId, orderId);
      assertReturnable(order, now(), windowDays);
      const items = assertReturnItems(order, input.items);
      // Seules les photos envoyées chez notre hébergeur sont acceptées : pas de lien vers un autre site
      if (input.evidenceUrls.some((url) => !media?.isHostedUrl(url)))
        throw new UnprocessableError('Joignez les photos depuis ce formulaire.');
      if (EVIDENCE_REQUIRED.has(input.reason) && !input.evidenceUrls.length)
        throw new UnprocessableError(
          'Ajoutez un justificatif (photo) pour un produit endommagé, défectueux ou non conforme.',
        );
      const created = await returns.create(order.id, { ...input, items });
      if (!created) throw new ConflictError('Une demande de retour existe déjà pour cette commande.');
      // Vente d'un vendeur : il est prévenu ; l'équipe Okoumé instruit et arbitre le dossier (32.7)
      const shop = order.shopId ? await shops.findById(order.shopId) : null;
      if (shop)
        await notifier.notifyCustomer(shop.ownerId, 'orders', {
          title: 'Demande de retour',
          body: `Le client de la commande ${order.number} demande un retour.`,
          url: `${appUrl}/vendeur/commandes/${order.id}`,
          tag: `retour-${order.number}`,
        });
      return toReturnDto(created);
    },

    get: async (customerId: string, orderId: string) => toReturnDto(await ownReturn(customerId, orderId)),

    /** Réouverture d'un dossier refusé, dans le délai prévu après le refus (14.6). */
    async reopen(customerId: string, orderId: string, comment: string) {
      const ret = await ownReturn(customerId, orderId);
      if (ret.status !== 'refused') throw new ConflictError('Seul un dossier refusé peut être rouvert.');
      const refusedAt = ret.events.filter((e) => e.status === 'refused').at(-1)?.createdAt ?? ret.createdAt;
      if (now().getTime() - refusedAt.getTime() > reopenDays * DAY_MS)
        throw new ConflictError(`Le délai de réouverture de ${reopenDays} jours est dépassé.`);
      const reopened = await returns.transition(
        ret,
        'pending',
        { reopenRequestedAt: now() },
        `Réouverture demandée par le client : ${comment}`,
        { type: 'customer' },
      );
      if (!reopened) throw new ConflictError('Le dossier a changé entre-temps : rechargez la page.');
      return toReturnDto(reopened);
    },
  };
};

export type ReturnsService = ReturnType<typeof createReturnsService>;
