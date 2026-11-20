import type { OrderRecord } from '../src/features/orders/orders.repository.js';
import type { SellerDashboardRepository } from '../src/features/seller-dashboard/seller-dashboard.repository.js';
import type { StaffCatalogRepository } from '../src/features/staff-catalog/staff-catalog.repository.js';

/** Espace vendeur en mémoire : chiffres calculés à partir des autres dépôts en mémoire, comme la base. */
export function createMemorySellerDashboard(store: { catalog: StaffCatalogRepository; orders: OrderRecord[] }) {
  const repository: SellerDashboardRepository = {
    async productCounts(shopId) {
      const { items } = await store.catalog.list({ shopId, page: 1, limit: 10_000 });
      const status = (s: string) => items.filter((p) => p.status === s).length;
      const moderation = (m: string) => items.filter((p) => p.moderation === m).length;
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
      const mine = store.orders.filter((o) => o.shopId === shopId);
      return {
        toPrepare: mine.filter((o) => o.status === 'confirmed' || o.status === 'preparing').length,
        toDeliver: mine.filter((o) => o.fulfilledBy === 'seller' && (o.status === 'ready' || o.status === 'shipping'))
          .length,
        toCollect: mine.filter(
          (o) => o.fulfilledBy === 'seller' && o.status === 'delivered' && o.paymentStatus === 'awaiting_payment',
        ).length,
      };
    },
  };
  return { repository };
}
