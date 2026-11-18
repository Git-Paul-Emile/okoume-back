import { NotFoundError } from '../../core/errors/AppError.js';
import type { ListingsRepository } from '../listings/listings.repository.js';
import { accessOf } from '../shops/shops.dto.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import type { SellerDashboardRepository } from './seller-dashboard.repository.js';
import { fillDays, lastDays } from './seller-dashboard.rules.js';

const PERIOD_DAYS = 30;
const TOP_LISTINGS = 5;

export interface SellerDashboardDependencies {
  dashboard: SellerDashboardRepository;
  shops: ShopsRepository;
  listings: ListingsRepository;
  now: () => Date;
}

/**
 * Espace vendeur (32.8) : l'état de l'offre d'accès, les annonces par état, ce qui attend une réponse (demandes,
 * questions du tchat) et les visites reçues. Chiffres de la seule boutique du compte connecté.
 */
export const createSellerDashboardService = ({ dashboard, shops, listings, now }: SellerDashboardDependencies) => {
  async function ownShop(customerId: string) {
    const shop = await shops.findByOwner(customerId);
    if (!shop) throw new NotFoundError('Ouvrez d’abord votre boutique.');
    return shop;
  }

  return {
    async overview(customerId: string) {
      const shop = await ownShop(customerId);
      const at = now();
      const [{ graceDays }, counts, requests, awaitingSeller, views] = await Promise.all([
        shops.settings(),
        dashboard.listingCounts(shop.id),
        dashboard.openRequestCounts(shop.id),
        dashboard.conversationsAwaitingSeller(shop.id),
        dashboard.shopViews(shop.id, lastDays(PERIOD_DAYS, at)[0]!, TOP_LISTINGS),
      ]);
      return {
        shop: {
          name: shop.name,
          slug: shop.slug,
          status: shop.status,
          verified: shop.verifiedAt !== null,
          plan: { name: shop.plan.name, kind: shop.plan.kind },
          access: accessOf(shop, at, graceDays),
        },
        listings: counts,
        requests: { awaitingAnswer: requests.sent, accepted: requests.accepted },
        conversations: { awaitingSeller },
        views: { periodDays: PERIOD_DAYS, total: views.total, topListings: views.topListings },
      };
    },

    /** Visites d'une annonce jour par jour sur 30 jours ; une annonce d'une autre boutique répond 404. */
    async listingStats(customerId: string, listingId: string) {
      const listing = await listings.findById(listingId);
      if (!listing || listing.shop.ownerId !== customerId) throw new NotFoundError('Annonce introuvable.');
      const days = lastDays(PERIOD_DAYS, now());
      const daily = fillDays(days, await dashboard.listingViews(listing.id, days[0]!));
      return {
        listing: { id: listing.id, slug: listing.slug, title: listing.title },
        total: daily.reduce((s, d) => s + d.views, 0),
        daily,
      };
    },
  };
};

export type SellerDashboardService = ReturnType<typeof createSellerDashboardService>;
