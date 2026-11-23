import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { fcfa } from '../../core/text/fcfa.js';
import type { Notifier } from '../notifications/notifier.js';
import { orderStatusMessage } from '../notifications/notifications.rules.js';
import { toOrderDto } from '../orders/orders.dto.js';
import type { OrderRecord, OrdersRepository } from '../orders/orders.repository.js';
import { advancePlan, cancelPlan, type TransitionPlan } from '../orders/orders.transitions.js';
import type { PaymentsRepository } from '../payments/payments.repository.js';
import { expectedPayment, PAYMENT_LABEL } from '../payments/payments.rules.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import type { CollectSellerOrderInput, ListSellerOrdersQuery } from './seller-orders.schemas.js';

export interface SellerOrdersDeps {
  orders: OrdersRepository;
  shops: ShopsRepository;
  payments: PaymentsRepository;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

const STALE = 'La commande vient de changer : rechargez-la.';

/**
 * Commandes reçues par la boutique du vendeur (cahier des charges 1.2, 32.4 à 32.6). Le vendeur prépare ses
 * commandes ; s'il livre lui-même, il les livre et déclare l'encaissement, sinon un livreur OKOZA les récupère.
 * Une boutique ne voit que ses commandes (IDOR) et une commande signalée attend la vérification d'OKOZA.
 */
export const createSellerOrdersService = ({ orders, shops, payments, notifier, appUrl, now }: SellerOrdersDeps) => {
  async function myShop(customerId: string) {
    const shop = await shops.findByOwner(customerId);
    if (!shop) throw new ForbiddenError('Ouvrez d’abord votre boutique pour vendre sur OKOZA.');
    return shop;
  }

  async function mine(customerId: string, id: string) {
    const shop = await myShop(customerId);
    const order = await orders.findById(id);
    if (!order || order.shopId !== shop.id) throw new NotFoundError('Commande introuvable.');
    return order;
  }

  async function apply(order: OrderRecord, plan: TransitionPlan) {
    const result = await orders.applyTransition(order, plan, { type: 'seller' });
    if (result.outcome === 'stale') throw new ConflictError(STALE);
    return result.order;
  }

  /** Étape suivante permise au vendeur, selon qui livre. */
  function nextPlan(order: OrderRecord, note: string | undefined): TransitionPlan {
    if (order.review?.status === 'pending')
      throw new ConflictError('Commande en cours de vérification par l’équipe OKOZA : attendez sa validation.');
    if (order.status === 'confirmed' || order.status === 'preparing') return advancePlan(order, note);
    if (order.fulfilledBy === 'okoza')
      throw new UnprocessableError('Un livreur OKOZA récupère la commande prête et la livre au client.');
    if (order.status === 'ready') return { from: 'ready', to: 'shipping', ...(note ? { note } : {}), stock: null };
    if (order.status === 'shipping') return advancePlan(order, note);
    throw new ConflictError('Cette commande ne peut plus avancer.');
  }

  return {
    async list(customerId: string, query: ListSellerOrdersQuery) {
      const shop = await myShop(customerId);
      const { items, total } = await orders.listForStaff({
        shopId: shop.id,
        status: query.status,
        search: query.search,
        sort: { field: 'createdAt', direction: 'desc' },
        page: query.page,
        limit: query.limit,
      });
      return paginate(items.map(toOrderDto), total, query.page, query.limit);
    },

    get: async (customerId: string, id: string) => toOrderDto(await mine(customerId, id)),

    async advance(customerId: string, id: string, note: string | undefined) {
      const order = await mine(customerId, id);
      const updated = await apply(order, nextPlan(order, note));
      // Prête et livrée par OKOZA : l'équipe affecte un livreur pour la récupérer chez le vendeur
      if (updated.status === 'ready' && updated.fulfilledBy === 'okoza')
        await notifier.notifyStaff('commandes:consulter', {
          title: 'Commande de vendeur prête',
          body: `${updated.number} : à récupérer chez ${updated.shop?.name ?? 'le vendeur'}`,
          url: `${appUrl}/admin/commandes`,
          tag: `vendeur-prete-${updated.number}`,
        });
      return toOrderDto(updated);
    },

    /** Remise confirmée par la boutique ; la livraison démarre après la dernière collecte de la tournée. */
    async handover(customerId: string, id: string) {
      const order = await mine(customerId, id);
      if (order.fulfilledBy !== 'okoza')
        throw new UnprocessableError('Cette commande est remise à votre propre livreur.');
      if (order.status !== 'courier_assigned')
        throw new ConflictError('La commande doit être affectée à un livreur OKOZA avant la collecte.');
      if (order.collectionConfirmedAt)
        throw new ConflictError('La remise au livreur est déjà confirmée.');
      const shop = await myShop(customerId);
      const result = await orders.confirmCentralCollection(order, shop.name, { type: 'seller' }, now());
      if (result.outcome === 'stale') throw new ConflictError(STALE);
      const updated = result.orders.find((stop) => stop.id === order.id);
      if (!updated) throw new ConflictError(STALE);
      if (updated.status === 'shipping' && updated.customerId) {
        const message = orderStatusMessage(updated, updated.status, appUrl);
        if (message) await notifier.notifyCustomer(updated.customerId, 'orders', message);
      }
      return toOrderDto(updated);
    },

    /** Annulation par le vendeur, tant que la commande n'est pas partie (rupture, erreur de prix…). */
    async cancel(customerId: string, id: string, reason: string) {
      const order = await mine(customerId, id);
      if (!['confirmed', 'preparing', 'ready'].includes(order.status))
        throw new ConflictError('Une commande partie en livraison ne peut plus être annulée par la boutique.');
      return toOrderDto(await apply(order, cancelPlan(order, `Annulée par la boutique : ${reason}`)));
    },

    /**
     * Encaissement à la livraison déclaré par le vendeur qui livre lui-même (32.6) : le total exact, avec la
     * référence de la transaction pour le Mobile Money.
     */
    async collect(customerId: string, id: string, input: CollectSellerOrderInput) {
      const order = await mine(customerId, id);
      if (order.fulfilledBy !== 'seller')
        throw new UnprocessableError('Le livreur OKOZA encaisse cette commande : l’équipe enregistre le paiement.');
      if (order.status !== 'delivered')
        throw new ConflictError('L’encaissement se déclare une fois la commande livrée.');
      if (order.paymentStatus !== 'awaiting_payment' && order.paymentStatus !== 'awaiting_verification')
        throw new ConflictError('L’encaissement de cette commande est déjà enregistré.');
      if (order.paymentMethod !== 'cash' && !input.reference)
        throw new UnprocessableError('Indiquez la référence de la transaction Mobile Money.');
      const amount = expectedPayment(order);
      const result = await payments.record(
        order,
        {
          kind: 'payment',
          amount,
          method: order.paymentMethod,
          occurredAt: now(),
          reference: input.reference,
          noReferenceReason: null,
          clientAgreed: false,
          staffId: null,
        },
        'paid',
        `Encaissement déclaré par la boutique : ${fcfa(amount)} (${PAYMENT_LABEL[order.paymentMethod]})`,
        { issuedAt: now() },
      );
      if (result.outcome === 'stale') throw new ConflictError(STALE);
      if (result.outcome === 'reference_taken')
        throw new ConflictError('Cette référence est déjà enregistrée sur une autre commande : vérifiez-la.');
      return toOrderDto((await orders.findById(id))!);
    },
  };
};

export type SellerOrdersService = ReturnType<typeof createSellerOrdersService>;
