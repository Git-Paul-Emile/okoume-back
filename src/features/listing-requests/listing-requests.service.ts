import { ConflictError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { randomReadableCode } from '../../core/security/secrets.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import type { ChatRepository } from '../chat/chat.repository.js';
import type { ListingsRepository } from '../listings/listings.repository.js';
import { publiclyVisible } from '../listings/listings.rules.js';
import type { Notifier } from '../notifications/notifier.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import { notifySeller } from '../shops/shops.service.js';
import { toBuyerRequestDto, toSellerRequestDto } from './listing-requests.dto.js';
import { buyerCancelledMessage, buyerUpdateMessage, newRequestMessage } from './listing-requests.emails.js';
import type { ListingRequestsRepository, RequestRecord } from './listing-requests.repository.js';
import type { CreateRequestInput, ListRequestsQuery, SellerActionInput } from './listing-requests.schemas.js';

const NUMBER_ATTEMPTS = 5;

export interface ListingRequestsDependencies {
  requests: ListingRequestsRepository;
  /** Prix convenu dans le tchat (32.5), appliqué tant qu'il est valable */
  chat: Pick<ChatRepository, 'validAgreement'>;
  listings: ListingsRepository;
  shops: ShopsRepository;
  email: EmailSender;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

/**
 * Demandes de commande sur les annonces des vendeurs tiers (32.7). Okoumé suit le statut de la demande ; le
 * paiement se fait directement entre l'acheteur et le vendeur, hors plateforme.
 */
export const createListingRequestsService = (deps: ListingRequestsDependencies) => {
  const { requests, chat, listings, shops, now } = deps;

  /** Une demande d'un autre compte répond 404, comme une demande inexistante (protection IDOR). */
  async function asBuyer(buyerId: string, id: string) {
    const request = await requests.findById(id);
    if (!request || request.buyer.id !== buyerId) throw new NotFoundError('Demande introuvable.');
    return request;
  }

  async function asSeller(customerId: string, id: string) {
    const request = await requests.findById(id);
    if (!request || request.shop.ownerId !== customerId) throw new NotFoundError('Demande introuvable.');
    return request;
  }

  async function tellSeller(request: RequestRecord, build: typeof newRequestMessage) {
    const seller = await shops.findOwner(request.shop.ownerId);
    if (seller) await notifySeller(deps, seller, build(seller, request, deps.appUrl));
  }

  async function tellBuyer(request: RequestRecord) {
    const message = buyerUpdateMessage(request, deps.appUrl);
    if (message) await notifySeller(deps, request.buyer, message, 'orders');
  }

  return {
    /**
     * Demande sur une annonce publiée d'une boutique visible, aux conditions de la boutique : quantité disponible,
     * moyen de paiement et mode de remise proposés. Une seule demande ouverte par acheteur et par annonce.
     */
    async create(buyerId: string, input: CreateRequestInput) {
      const listing = await listings.findBySlug(input.listingSlug);
      const { graceDays } = await shops.settings();
      if (!listing || !publiclyVisible(listing, now(), graceDays)) throw new NotFoundError('Annonce introuvable.');
      if (listing.shop.ownerId === buyerId)
        throw new UnprocessableError('Vous ne pouvez pas commander votre propre annonce.');
      if (listing.kind === 'service' && input.quantity !== null)
        throw new UnprocessableError('Un service se demande sans quantité.');
      if (listing.kind === 'product') {
        if (input.quantity === null) throw new UnprocessableError('Indiquez la quantité souhaitée.');
        if (input.quantity > (listing.quantity ?? 0))
          throw new UnprocessableError(`Quantité disponible : ${listing.quantity ?? 0}.`);
      }
      const shop = await shops.findById(listing.shop.id);
      if (!shop) throw new NotFoundError('Annonce introuvable.');
      if (!shop.acceptedPaymentMethods.includes(input.paymentMethod))
        throw new UnprocessableError('Ce vendeur n’accepte pas ce moyen de paiement.');
      if (!shop.handoverModes.includes(input.handover))
        throw new UnprocessableError('Ce vendeur ne propose pas ce mode de remise.');

      // Prix convenu dans le tchat, s'il est encore valable ; sinon le prix affiché
      const agreed = await chat.validAgreement(listing.id, buyerId, now());
      const unitPrice = agreed !== null && agreed <= listing.price ? agreed : listing.price;
      for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt++) {
        const result = await requests.create(
          {
            number: `DEM-${randomReadableCode(8)}`,
            listingId: listing.id,
            shopId: listing.shop.id,
            buyerId,
            listingTitle: listing.title,
            quantity: input.quantity,
            unitPrice,
            paymentMethod: input.paymentMethod,
            handover: input.handover,
            contactPhone: input.contactPhone,
            message: input.message,
          },
          now(),
        );
        if (result === 'already_open')
          throw new ConflictError('Vous avez déjà une demande en cours pour cette annonce.');
        if (result !== 'number_taken') {
          await tellSeller(result, newRequestMessage);
          return toBuyerRequestDto(result);
        }
      }
      throw new Error('Impossible d’attribuer un numéro de demande unique.');
    },

    async buyerList(buyerId: string, query: ListRequestsQuery) {
      const { items, total } = await requests.list({ buyerId, ...query });
      return paginate(items.map(toBuyerRequestDto), total, query.page, query.limit);
    },

    async buyerGet(buyerId: string, id: string) {
      return toBuyerRequestDto(await asBuyer(buyerId, id));
    },

    /** Annulation par l'acheteur, tant que la vente n'est pas conclue ; le vendeur est prévenu. */
    async cancel(buyerId: string, id: string, reason: string | undefined) {
      const request = await asBuyer(buyerId, id);
      const updated = await requests.transition(request.id, {
        from: ['sent', 'accepted'],
        to: 'cancelled',
        actor: 'buyer',
        reason: reason || null,
        at: now(),
      });
      if (!updated) throw new ConflictError('Cette demande ne peut plus être annulée.');
      await tellSeller(updated, buyerCancelledMessage);
      return toBuyerRequestDto(updated);
    },

    async sellerList(customerId: string, query: ListRequestsQuery) {
      const shop = await shops.findByOwner(customerId);
      if (!shop) throw new NotFoundError('Ouvrez d’abord votre boutique.');
      const { items, total } = await requests.list({ shopId: shop.id, ...query });
      return paginate(items.map(toSellerRequestDto), total, query.page, query.limit);
    },

    async sellerGet(customerId: string, id: string) {
      return toSellerRequestDto(await asSeller(customerId, id));
    },

    /**
     * Décision du vendeur. Accepter vérifie la quantité encore disponible ; conclure la retire de l'annonce. Le
     * vendeur déclare lui-même l'issue : Okoumé ne voit pas le paiement.
     */
    async sellerAct(customerId: string, id: string, input: SellerActionInput) {
      const request = await asSeller(customerId, id);
      const at = now();
      let updated: RequestRecord | null;
      switch (input.action) {
        case 'accept': {
          const shop = await shops.findById(request.shop.id);
          if (shop?.status === 'suspended')
            throw new ConflictError('Votre boutique est suspendue : elle ne peut pas accepter de demande.');
          const listing = await listings.findById(request.listing.id);
          if (request.quantity !== null && (listing?.quantity ?? 0) < request.quantity)
            throw new ConflictError('La quantité demandée n’est plus disponible.');
          updated = await requests.transition(id, {
            from: ['sent'],
            to: 'accepted',
            actor: 'seller',
            reason: null,
            at,
          });
          break;
        }
        case 'refuse':
          updated = await requests.transition(id, {
            from: ['sent'],
            to: 'refused',
            actor: 'seller',
            reason: input.reason,
            at,
          });
          break;
        case 'not_concluded':
          updated = await requests.transition(id, {
            from: ['accepted'],
            to: 'not_concluded',
            actor: 'seller',
            reason: input.reason,
            at,
          });
          break;
        case 'conclude': {
          const result = await requests.conclude(id, at);
          if (result === 'insufficient')
            throw new ConflictError('La quantité de l’annonce ne suffit plus : mettez-la à jour avant de conclure.');
          updated = result === 'stale' ? null : result;
          break;
        }
      }
      if (!updated) throw new ConflictError('Cette demande a changé entre-temps : rechargez-la.');
      await tellBuyer(updated);
      return toSellerRequestDto(updated);
    },
  };
};

export type ListingRequestsService = ReturnType<typeof createListingRequestsService>;
