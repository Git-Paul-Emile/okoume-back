import { NotFoundError } from '../../core/errors/AppError.js';
import { accessOf } from '../shops/shops.dto.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import type { SellerDashboardRepository } from './seller-dashboard.repository.js';

export interface SellerDashboardDependencies {
  dashboard: SellerDashboardRepository;
  shops: ShopsRepository;
  now: () => Date;
}

/**
 * Espace vendeur (32.8) : l'état de l'offre d'accès, les produits par état, les commandes qui attendent une action
 * et les commandes qui attendent une action. Chiffres de la seule boutique du compte connecté.
 */
export const createSellerDashboardService = ({ dashboard, shops, now }: SellerDashboardDependencies) => ({
  async overview(customerId: string) {
    const shop = await shops.findByOwner(customerId);
    if (!shop) throw new NotFoundError('Ouvrez d’abord votre boutique.');
    const [{ graceDays }, products, orders] = await Promise.all([
      shops.settings(),
      dashboard.productCounts(shop.id),
      dashboard.orderCounts(shop.id),
    ]);
    return {
      shop: {
        name: shop.name,
        slug: shop.slug,
        status: shop.status,
        verified: shop.verifiedAt !== null,
        plan: { name: shop.plan.name, kind: shop.plan.kind },
        access: accessOf(shop, now(), graceDays),
      },
      products,
      orders,
    };
  },
});

export type SellerDashboardService = ReturnType<typeof createSellerDashboardService>;
