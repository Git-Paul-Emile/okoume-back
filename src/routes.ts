import { Router } from 'express';
import { createAccountRoutes } from './features/account/account.routes.js';
import { createPublicSettingsRoutes, createStaffSettingsRoutes } from './features/settings/settings.routes.js';
import type { SettingsService } from './features/settings/settings.service.js';
import { createPublicPromoCodesRoutes } from './features/promo-codes/promo-codes.routes.js';
import type { PublicPromoCodesService } from './features/promo-codes/promo-codes.service.js';
import { createReviewsRoutes, createStaffReviewsRoutes } from './features/reviews/reviews.routes.js';
import type { ReviewsService } from './features/reviews/reviews.service.js';
import { createContentRoutes, createStaffContentRoutes } from './features/content/content.routes.js';
import type { ContentService } from './features/content/content.service.js';
import { createSellerProductsRoutes } from './features/seller-products/seller-products.routes.js';
import type { SellerProductsService } from './features/seller-products/seller-products.service.js';
import { createSellerOrdersRoutes } from './features/seller-orders/seller-orders.routes.js';
import type { SellerOrdersService } from './features/seller-orders/seller-orders.service.js';
import { createSellerDeliveryRoutes } from './features/seller-delivery/seller-delivery.routes.js';
import type { SellerDeliveryService } from './features/seller-delivery/seller-delivery.service.js';
import { createSellerPayoutsRoutes, createStaffPayoutsRoutes } from './features/payouts/payouts.routes.js';
import type { PayoutsService } from './features/payouts/payouts.service.js';
import type { AccountService } from './features/account/account.service.js';
import { createAuthRoutes } from './features/auth/auth.routes.js';
import type { AuthService } from './features/auth/auth.service.js';
import { createCategoriesRoutes } from './features/categories/categories.routes.js';
import type { CategoriesService } from './features/categories/categories.service.js';
import { createDeliveryZonesRoutes } from './features/delivery-zones/delivery-zones.routes.js';
import type { DeliveryZonesService } from './features/delivery-zones/delivery-zones.service.js';
import {
  createCheckoutRoutes,
  createOrdersRoutes,
  createOrderTrackingRoutes,
} from './features/orders/orders.routes.js';
import type { OrdersService } from './features/orders/orders.service.js';
import { createStaffPaymentsRoutes } from './features/staff-payments/staff-payments.routes.js';
import type { StaffPaymentsService } from './features/staff-payments/staff-payments.service.js';
import { createStaffPromoCodesRoutes } from './features/staff-promo-codes/staff-promo-codes.routes.js';
import type { StaffPromoCodesService } from './features/staff-promo-codes/staff-promo-codes.service.js';
import { createProductsRoutes } from './features/products/products.routes.js';
import type { ProductsService } from './features/products/products.service.js';
import { createStaffAuthRoutes } from './features/staff-auth/staff-auth.routes.js';
import type { StaffAuthService } from './features/staff-auth/staff-auth.service.js';
import { createStaffCouriersRoutes } from './features/staff-couriers/staff-couriers.routes.js';
import type { StaffCouriersService } from './features/staff-couriers/staff-couriers.service.js';
import { createStaffCatalogRoutes } from './features/staff-catalog/staff-catalog.routes.js';
import type { StaffCatalogService } from './features/staff-catalog/staff-catalog.service.js';
import { createStaffCategoriesRoutes } from './features/staff-categories/staff-categories.routes.js';
import type { StaffCategoriesService } from './features/staff-categories/staff-categories.service.js';
import { createStaffZonesRoutes } from './features/staff-delivery-zones/staff-delivery-zones.routes.js';
import type { StaffZonesService } from './features/staff-delivery-zones/staff-delivery-zones.service.js';
import { createStaffOrdersRoutes } from './features/staff-orders/staff-orders.routes.js';
import type { StaffOrdersService } from './features/staff-orders/staff-orders.service.js';
import { createStaffStockRoutes } from './features/staff-stock/staff-stock.routes.js';
import type { StaffStockService } from './features/staff-stock/staff-stock.service.js';
import { createStaffMediaRoutes } from './features/staff-media/staff-media.routes.js';
import type { StaffMediaService } from './features/staff-media/staff-media.service.js';
import { createPublicShopsRoutes, createSellerShopRoutes } from './features/shops/shops.routes.js';
import type { ShopsService } from './features/shops/shops.service.js';
import { createStaffMarketplaceRoutes } from './features/staff-shops/staff-shops.routes.js';
import type { StaffShopsService } from './features/staff-shops/staff-shops.service.js';
import { createSellerDashboardRoutes } from './features/seller-dashboard/seller-dashboard.routes.js';
import type { SellerDashboardService } from './features/seller-dashboard/seller-dashboard.service.js';

export interface ApiServices {
  auth: AuthService;
  account: AccountService;
  settings: SettingsService;
  publicPromoCodes: PublicPromoCodesService;
  reviews: ReviewsService;
  content: ContentService;
  sellerProducts: SellerProductsService;
  sellerOrders: SellerOrdersService;
  sellerDelivery: SellerDeliveryService;
  payouts: PayoutsService;
  staffAuth: StaffAuthService;
  categories: CategoriesService;
  products: ProductsService;
  deliveryZones: DeliveryZonesService;
  orders: OrdersService;
  staffOrders: StaffOrdersService;
  staffCouriers: StaffCouriersService;
  staffPayments: StaffPaymentsService;
  staffPromoCodes: StaffPromoCodesService;
  staffStock: StaffStockService;
  staffCatalog: StaffCatalogService;
  staffCategories: StaffCategoriesService;
  staffZones: StaffZonesService;
  staffMedia: StaffMediaService;
  shops: ShopsService;
  staffShops: StaffShopsService;
  sellerDashboard: SellerDashboardService;
  now: () => Date;
}

/** Routes publiques, client, vendeur et administration conservées pour le MVP. */
export const createApiRoutes = (services: ApiServices) => {
  const router = Router();

  router.use('/auth', createAuthRoutes(services.auth, services.now));
  router.use('/me', createAccountRoutes(services.account, services.now));
  router.use('/settings', createPublicSettingsRoutes(services.settings));
  router.use('/promo-codes', createPublicPromoCodesRoutes(services.publicPromoCodes));
  router.use('/reviews', createReviewsRoutes(services.reviews, services.now));
  router.use('/content', createContentRoutes(services.content));
  router.use('/staff/content', createStaffContentRoutes(services.content, services.staffAuth, services.now));
  router.use('/staff/reviews', createStaffReviewsRoutes(services.reviews, services.staffAuth, services.now));
  router.use('/staff/settings/shop', createStaffSettingsRoutes(services.settings, services.staffAuth, services.now));

  router.use('/categories', createCategoriesRoutes(services.categories));
  router.use('/products', createProductsRoutes(services.products));
  router.use('/delivery-zones', createDeliveryZonesRoutes(services.deliveryZones));
  router.use('/orders', createOrdersRoutes(services.orders, services.now));
  router.use('/order-tracking', createOrderTrackingRoutes(services.orders));
  router.use('/checkout', createCheckoutRoutes(services.orders, services.now));

  router.use('/staff/auth', createStaffAuthRoutes(services.staffAuth, services.now));
  router.use('/staff/orders', createStaffPaymentsRoutes(services.staffPayments, services.staffAuth, services.now));
  router.use('/staff/orders', createStaffOrdersRoutes(services.staffOrders, services.staffAuth, services.now));
  router.use(
    '/staff/promo-codes',
    createStaffPromoCodesRoutes(services.staffPromoCodes, services.staffAuth, services.now),
  );
  router.use('/staff/couriers', createStaffCouriersRoutes(services.staffCouriers, services.staffAuth, services.now));
  router.use('/staff/variants', createStaffStockRoutes(services.staffStock, services.staffAuth, services.now));
  router.use('/staff/products', createStaffCatalogRoutes(services.staffCatalog, services.staffAuth, services.now));
  router.use(
    '/staff/categories',
    createStaffCategoriesRoutes(services.staffCategories, services.staffAuth, services.now),
  );
  router.use('/staff/delivery-zones', createStaffZonesRoutes(services.staffZones, services.staffAuth, services.now));
  router.use('/staff/media', createStaffMediaRoutes(services.staffMedia, services.staffAuth, services.now));

  router.use('/shops', createPublicShopsRoutes(services.shops));
  router.use('/seller/shop', createSellerShopRoutes(services.shops, services.now));
  router.use('/seller/products', createSellerProductsRoutes(services.sellerProducts, services.now));
  router.use('/seller/orders', createSellerOrdersRoutes(services.sellerOrders, services.now));
  router.use('/seller/payouts', createSellerPayoutsRoutes(services.payouts, services.now));
  router.use('/seller/delivery', createSellerDeliveryRoutes(services.sellerDelivery, services.now));
  router.use('/seller/dashboard', createSellerDashboardRoutes(services.sellerDashboard, services.now));

  const marketplace = createStaffMarketplaceRoutes(services.staffShops, services.staffAuth, services.now);
  router.use('/staff/shops', marketplace.shops);
  router.use('/staff/payouts', createStaffPayoutsRoutes(services.payouts, services.staffAuth, services.now));
  return router;
};
