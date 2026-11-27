import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import type { Notifier } from '../notifications/notifier.js';
import { orderStatusMessage } from '../notifications/notifications.rules.js';
import { toOrderDto } from '../orders/orders.dto.js';
import type { OrderRecord, OrdersRepository } from '../orders/orders.repository.js';
import { advancePlan, type TransitionPlan } from '../orders/orders.transitions.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import type { ListSellerOrdersQuery } from './seller-orders.schemas.js';

export interface SellerOrdersDeps {
  orders: OrdersRepository;
  shops: ShopsRepository;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

const STALE = 'La commande vient de changer : rechargez-la.';

/**
 * Commandes reçues par la boutique du vendeur. Le vendeur prépare et livre ses commandes selon l'organisation choisie.
 * Une boutique ne voit que ses commandes (IDOR) et une commande signalée attend la vérification d'OKOZA.
 */
export const createSellerOrdersService = ({ orders, shops, notifier, appUrl, now }: SellerOrdersDeps) => {
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
      if (order.collectionConfirmedAt) throw new ConflictError('La remise au livreur est déjà confirmée.');
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
  };
};

export type SellerOrdersService = ReturnType<typeof createSellerOrdersService>;
