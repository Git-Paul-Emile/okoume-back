import type { ListingStatus } from '../src/features/listings/listings.repository.js';
import type { SellerDashboardRepository } from '../src/features/seller-dashboard/seller-dashboard.repository.js';

/** Espace vendeur en mémoire : chiffres calculés à partir des autres dépôts en mémoire, comme la base. */
export function createMemorySellerDashboard(store: {
  listings: Array<{ id: string; slug: string; title: string; shopId: string; status: ListingStatus }>;
  requests: Array<{ shopId: string; status: string }>;
  conversations: Array<{ shopId: string; needsSeller: boolean }>;
}) {
  const views = new Map<string, number>();
  const key = (listingId: string, day: Date) => `${listingId}|${day.toISOString().slice(0, 10)}`;

  const repository: SellerDashboardRepository = {
    async recordView(listingId, day) {
      views.set(key(listingId, day), (views.get(key(listingId, day)) ?? 0) + 1);
    },
    async listingCounts(shopId) {
      const counts: Partial<Record<ListingStatus, number>> = {};
      for (const l of store.listings.filter((x) => x.shopId === shopId)) counts[l.status] = (counts[l.status] ?? 0) + 1;
      return counts;
    },
    async openRequestCounts(shopId) {
      const mine = store.requests.filter((r) => r.shopId === shopId);
      return {
        sent: mine.filter((r) => r.status === 'sent').length,
        accepted: mine.filter((r) => r.status === 'accepted').length,
      };
    },
    async conversationsAwaitingSeller(shopId) {
      return store.conversations.filter((c) => c.shopId === shopId && c.needsSeller).length;
    },
    async shopViews(shopId, since, top) {
      const totals = store.listings
        .filter((l) => l.shopId === shopId)
        .map((l) => ({
          id: l.id,
          slug: l.slug,
          title: l.title,
          views: [...views]
            .filter(([k]) => k.startsWith(`${l.id}|`) && new Date(k.split('|')[1]!) >= since)
            .reduce((sum, [, n]) => sum + n, 0),
        }))
        .filter((l) => l.views > 0)
        .sort((a, b) => b.views - a.views);
      return { total: totals.reduce((s, l) => s + l.views, 0), topListings: totals.slice(0, top) };
    },
    async listingViews(listingId, since) {
      return [...views]
        .filter(([k]) => k.startsWith(`${listingId}|`))
        .map(([k, count]) => ({ day: new Date(`${k.split('|')[1]}T00:00:00.000Z`), count }))
        .filter((v) => v.day >= since)
        .sort((a, b) => a.day.getTime() - b.day.getTime());
    },
  };
  return { repository, views };
}
