import type { AppDependencies } from './app.js';
import { env } from './config/env.js';
import { accountRepository } from './features/account/account.repository.js';
import { createAccountService } from './features/account/account.service.js';
import { createAuthService } from './features/auth/auth.service.js';
import { customersRepository } from './features/auth/auth.repository.js';
import { categoriesRepository } from './features/categories/categories.repository.js';
import { createCategoriesService } from './features/categories/categories.service.js';
import { contentRepository } from './features/content/content.repository.js';
import { createContentService } from './features/content/content.service.js';
import { deliveryZonesRepository } from './features/delivery-zones/delivery-zones.repository.js';
import { createDeliveryZonesService } from './features/delivery-zones/delivery-zones.service.js';
import { healthRepository } from './features/health/health.repository.js';
import { createHealthService } from './features/health/health.service.js';
import { ordersRepository } from './features/orders/orders.repository.js';
import { createOrdersService } from './features/orders/orders.service.js';
import { sellerTermsRepository } from './features/orders/orders.sellers.repository.js';
import { paymentsRepository } from './features/payments/payments.repository.js';
import { promoCodesRepository } from './features/promo-codes/promo-codes.repository.js';
import { createPublicPromoCodesService } from './features/promo-codes/promo-codes.service.js';
import { productsRepository } from './features/products/products.repository.js';
import { createProductsService } from './features/products/products.service.js';
import { createPayoutsService } from './features/payouts/payouts.service.js';
import { payoutsRepository } from './features/payouts/payouts.repository.js';
import { createSellerDeliveryService } from './features/seller-delivery/seller-delivery.service.js';
import { sellerDeliveryRepository } from './features/seller-delivery/seller-delivery.repository.js';
import { createSellerOrdersService } from './features/seller-orders/seller-orders.service.js';
import { createSellerProductsService } from './features/seller-products/seller-products.service.js';
import { createSellerDashboardService } from './features/seller-dashboard/seller-dashboard.service.js';
import { sellerDashboardRepository } from './features/seller-dashboard/seller-dashboard.repository.js';
import { createSessionsService } from './features/sessions/sessions.service.js';
import { sessionsRepository } from './features/sessions/sessions.repository.js';
import { createSettingsService } from './features/settings/settings.service.js';
import { informationRepository } from './features/settings/settings.repository.js';
import { createStaffAuthService } from './features/staff-auth/staff-auth.service.js';
import { staffRepository } from './features/staff-auth/staff-auth.repository.js';
import { createStaffCategoriesService } from './features/staff-categories/staff-categories.service.js';
import { staffCategoriesRepository } from './features/staff-categories/staff-categories.repository.js';
import { createStaffCouriersService } from './features/staff-couriers/staff-couriers.service.js';
import { couriersRepository } from './features/staff-couriers/staff-couriers.repository.js';
import { createStaffMediaService } from './features/staff-media/staff-media.service.js';
import { createStaffOrdersService } from './features/staff-orders/staff-orders.service.js';
import { createStaffPromoCodesService } from './features/staff-promo-codes/staff-promo-codes.service.js';
import { createStaffCatalogService } from './features/staff-catalog/staff-catalog.service.js';
import { staffCatalogRepository } from './features/staff-catalog/staff-catalog.repository.js';
import { createStaffStockService } from './features/staff-stock/staff-stock.service.js';
import { stockRepository } from './features/staff-stock/staff-stock.repository.js';
import { createStaffZonesService } from './features/staff-delivery-zones/staff-delivery-zones.service.js';
import { staffZonesRepository } from './features/staff-delivery-zones/staff-delivery-zones.repository.js';
import { createShopsService } from './features/shops/shops.service.js';
import { shopsRepository } from './features/shops/shops.repository.js';
import { createStaffShopsService } from './features/staff-shops/staff-shops.service.js';
import { reviewsRepository } from './features/reviews/reviews.repository.js';
import { createReviewsService } from './features/reviews/reviews.service.js';
import { createQueuedEmailSender } from './infrastructure/email/queuedEmailSender.js';
import { selectMediaStorage } from './infrastructure/media/selectMediaStorage.js';
import { createNotifier } from './features/notifications/notifier.js';
import { createStaffPaymentsService as createPaymentsService } from './features/staff-payments/staff-payments.service.js';
import type { JobQueue } from './infrastructure/queue/jobQueue.js';

/** Assemble uniquement les dépendances des parcours conservés dans le MVP. */
export const createDependencies = (queue: JobQueue): AppDependencies => {
  const now = () => new Date();
  const email = createQueuedEmailSender(queue);
  const notifier = createNotifier(queue);
  const media = selectMediaStorage(env);
  const sessions = createSessionsService(sessionsRepository, now);
  const categories = createCategoriesService(categoriesRepository);
  const products = createProductsService(productsRepository, categories, now);
  const deliveryZones = createDeliveryZonesService(deliveryZonesRepository);
  const publicPromoCodes = createPublicPromoCodesService(promoCodesRepository, now);
  const settings = createSettingsService({ information: informationRepository });

  return {
    now,
    health: createHealthService(healthRepository),
    auth: createAuthService({
      customers: customersRepository,
      sessions,
      now,
    }),
    staffAuth: createStaffAuthService({ staff: staffRepository, sessions, now }),
    categories,
    products,
    deliveryZones,
    account: createAccountService({ customers: customersRepository, account: accountRepository }),
    orders: createOrdersService({
      orders: ordersRepository,
      products: productsRepository,
      zones: deliveryZonesRepository,
      categories,
      promoCodes: promoCodesRepository,
      sellers: sellerTermsRepository,
      email,
      notifier,
      appUrl: env.APP_URL,
      now,
    }),
    staffOrders: createStaffOrdersService({
      orders: ordersRepository,
      couriers: couriersRepository,
      zones: staffZonesRepository,
      email,
      notifier,
      appUrl: env.APP_URL,
      now,
    }),
    staffCouriers: createStaffCouriersService(couriersRepository),
    staffPayments: createPaymentsService(ordersRepository, paymentsRepository),
    publicPromoCodes,
    settings,
    staffPromoCodes: createStaffPromoCodesService(promoCodesRepository, now),
    staffStock: createStaffStockService(stockRepository),
    staffCatalog: createStaffCatalogService(staffCatalogRepository),
    payouts: createPayoutsService(payoutsRepository, shopsRepository),
    sellerDelivery: createSellerDeliveryService({
      delivery: sellerDeliveryRepository,
      shops: shopsRepository,
      zones: deliveryZonesRepository,
    }),
    sellerOrders: createSellerOrdersService({
      orders: ordersRepository,
      shops: shopsRepository,
      notifier,
      appUrl: env.APP_URL,
      now,
    }),
    sellerProducts: createSellerProductsService({
      catalog: staffCatalogRepository,
      shops: shopsRepository,
      stock: stockRepository,
      media,
      now,
    }),
    staffCategories: createStaffCategoriesService(staffCategoriesRepository),
    staffZones: createStaffZonesService(staffZonesRepository),
    staffMedia: createStaffMediaService(media, now),
    content: createContentService({ content: contentRepository }),
    reviews: createReviewsService({ reviews: reviewsRepository, customers: customersRepository, media, now }),
    shops: createShopsService({ shops: shopsRepository, email, notifier, appUrl: env.APP_URL }),
    staffShops: createStaffShopsService({ shops: shopsRepository, email, notifier, appUrl: env.APP_URL, now }),
    sellerDashboard: createSellerDashboardService({ dashboard: sellerDashboardRepository, shops: shopsRepository }),
  };
};
