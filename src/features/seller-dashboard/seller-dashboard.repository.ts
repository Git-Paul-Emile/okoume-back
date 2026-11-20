import { prisma } from '../../lib/prisma.js';

/** Produits d'une boutique par état de vente et de vérification (32.3). */
export interface ProductCounts {
  published: number;
  draft: number;
  archived: number;
  inReview: number;
  changesRequested: number;
  pendingModeration: number;
  rejected: number;
}

/** Commandes qui attendent une action du vendeur (32.4 à 32.6). */
export interface OrderCounts {
  /** Confirmées ou en préparation : à préparer */
  toPrepare: number;
  /** Prêtes ou en livraison, quand le vendeur livre lui-même */
  toDeliver: number;
  /** Livrées par le vendeur, encaissement pas encore déclaré */
  toCollect: number;
}

export interface SellerDashboardRepository {
  productCounts(shopId: string): Promise<ProductCounts>;
  orderCounts(shopId: string): Promise<OrderCounts>;
}

export const sellerDashboardRepository: SellerDashboardRepository = {
  async productCounts(shopId) {
    const [byStatus, byModeration] = await Promise.all([
      prisma.product.groupBy({ by: ['status'], where: { shopId }, _count: { _all: true } }),
      prisma.product.groupBy({ by: ['moderation'], where: { shopId }, _count: { _all: true } }),
    ]);
    const status = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
    const moderation = (m: string) => byModeration.find((r) => r.moderation === m)?._count._all ?? 0;
    return {
      published: status('published'),
      draft: status('draft'),
      archived: status('archived'),
      inReview: moderation('in_review'),
      changesRequested: moderation('changes_requested'),
      pendingModeration: moderation('pending_moderation'),
      rejected: moderation('rejected'),
    };
  },

  async orderCounts(shopId) {
    const [toPrepare, toDeliver, toCollect] = await Promise.all([
      prisma.order.count({ where: { shopId, status: { in: ['confirmed', 'preparing'] } } }),
      prisma.order.count({ where: { shopId, fulfilledBy: 'seller', status: { in: ['ready', 'shipping'] } } }),
      prisma.order.count({
        where: { shopId, fulfilledBy: 'seller', status: 'delivered', paymentStatus: 'awaiting_payment' },
      }),
    ]);
    return { toPrepare, toDeliver, toCollect };
  },
};
