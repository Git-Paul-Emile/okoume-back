import type { AppDependencies } from './app.js';
import { env, simulateConfirmations } from './config/env.js';
import { accountRepository } from './features/account/account.repository.js';
import { informationRepository } from './features/settings/settings.repository.js';
import { createSettingsService } from './features/settings/settings.service.js';
import { reviewsRepository } from './features/reviews/reviews.repository.js';
import { createReviewsService } from './features/reviews/reviews.service.js';
import { contentRepository } from './features/content/content.repository.js';
import { createContentService } from './features/content/content.service.js';
import { staffCustomersRepository } from './features/staff-customers/staff-customers.repository.js';
import { createStaffCustomersService } from './features/staff-customers/staff-customers.service.js';
import { staffTeamRepository } from './features/staff-team/staff-team.repository.js';
import { createStaffTeamService } from './features/staff-team/staff-team.service.js';
import { zoneRequestsRepository } from './features/zone-requests/zone-requests.repository.js';
import { createZoneRequestsService } from './features/zone-requests/zone-requests.service.js';
import { staffActivityRepository } from './features/staff-activity/staff-activity.repository.js';
import { createStaffActivityService } from './features/staff-activity/staff-activity.service.js';
import { staffAlertsRepository } from './features/staff-alerts/staff-alerts.repository.js';
import { createStaffAlertsService } from './features/staff-alerts/staff-alerts.service.js';
import { emailDeliveriesRepository } from './features/email-deliveries/email-deliveries.repository.js';
import { createEmailDeliveriesService } from './features/email-deliveries/email-deliveries.service.js';
import { staffAssistantRepository } from './features/staff-assistant/staff-assistant.repository.js';
import { createStaffAssistantService } from './features/staff-assistant/staff-assistant.service.js';
import { analyticsRepository } from './features/analytics/analytics.repository.js';
import { createAnalyticsService } from './features/analytics/analytics.service.js';
import { createShopAssistantService } from './features/shop-assistant/shop-assistant.service.js';
import { selectShopAssistant } from './infrastructure/ai/selectShopAssistant.js';
import { createAccountService } from './features/account/account.service.js';
import { customersRepository } from './features/auth/auth.repository.js';
import { createAuthService } from './features/auth/auth.service.js';
import { categoriesRepository } from './features/categories/categories.repository.js';
import { createCategoriesService } from './features/categories/categories.service.js';
import { deliveryZonesRepository } from './features/delivery-zones/delivery-zones.repository.js';
import { createDeliveryZonesService } from './features/delivery-zones/delivery-zones.service.js';
import { healthRepository } from './features/health/health.repository.js';
import { ordersRepository } from './features/orders/orders.repository.js';
import { createOrdersService } from './features/orders/orders.service.js';
import { productsRepository } from './features/products/products.repository.js';
import { paymentsRepository } from './features/payments/payments.repository.js';
import { createStaffPaymentsService } from './features/staff-payments/staff-payments.service.js';
import { returnsRepository } from './features/returns/returns.repository.js';
import { createReturnsService } from './features/returns/returns.service.js';
import { createStaffReturnsService } from './features/staff-returns/staff-returns.service.js';
import { loyaltyRepository } from './features/loyalty/loyalty.repository.js';
import { promoCodesRepository } from './features/promo-codes/promo-codes.repository.js';
import { createPublicPromoCodesService } from './features/promo-codes/promo-codes.service.js';
import { invoicesRepository } from './features/invoices/invoices.repository.js';
import { createInvoicesService } from './features/invoices/invoices.service.js';
import { createStaffPromoCodesService } from './features/staff-promo-codes/staff-promo-codes.service.js';
import { createProductsService } from './features/products/products.service.js';
import { createHealthService } from './features/health/health.service.js';
import { sessionsRepository } from './features/sessions/sessions.repository.js';
import { createSessionsService } from './features/sessions/sessions.service.js';
import { staffRepository } from './features/staff-auth/staff-auth.repository.js';
import { createStaffAuthService } from './features/staff-auth/staff-auth.service.js';
import { staffCatalogRepository } from './features/staff-catalog/staff-catalog.repository.js';
import { createStaffCatalogService } from './features/staff-catalog/staff-catalog.service.js';
import { staffCategoriesRepository } from './features/staff-categories/staff-categories.repository.js';
import { createStaffCategoriesService } from './features/staff-categories/staff-categories.service.js';
import { staffZonesRepository } from './features/staff-delivery-zones/staff-delivery-zones.repository.js';
import { createStaffZonesService } from './features/staff-delivery-zones/staff-delivery-zones.service.js';
import { couriersRepository } from './features/staff-couriers/staff-couriers.repository.js';
import { createStaffCouriersService } from './features/staff-couriers/staff-couriers.service.js';
import { createStaffOrdersService } from './features/staff-orders/staff-orders.service.js';
import { stockRepository } from './features/staff-stock/staff-stock.repository.js';
import { createSellerProductsService } from './features/seller-products/seller-products.service.js';
import { sellerTermsRepository } from './features/orders/orders.sellers.repository.js';
import { createSellerOrdersService } from './features/seller-orders/seller-orders.service.js';
import { createSellerDeliveryService } from './features/seller-delivery/seller-delivery.service.js';
import { sellerDeliveryRepository } from './features/seller-delivery/seller-delivery.repository.js';
import { createPayoutsService } from './features/payouts/payouts.service.js';
import { payoutsRepository } from './features/payouts/payouts.repository.js';
import { createStaffStockService } from './features/staff-stock/staff-stock.service.js';
import { verificationRepository } from './features/verification/verification.repository.js';
import { createVerificationService } from './features/verification/verification.service.js';
import { notificationsRepository } from './features/notifications/notifications.repository.js';
import { createNotificationsService } from './features/notifications/notifications.service.js';
import { createNotifier } from './features/notifications/notifier.js';
import { createQueuedEmailSender } from './infrastructure/email/queuedEmailSender.js';
import { selectMediaStorage } from './infrastructure/media/selectMediaStorage.js';
import { shopsRepository } from './features/shops/shops.repository.js';
import { createShopsService } from './features/shops/shops.service.js';
import { createStaffShopsService } from './features/staff-shops/staff-shops.service.js';
import { sellerDashboardRepository } from './features/seller-dashboard/seller-dashboard.repository.js';
import { createSellerDashboardService } from './features/seller-dashboard/seller-dashboard.service.js';
import { createStaffMediaService } from './features/staff-media/staff-media.service.js';
import type { JobQueue } from './infrastructure/queue/jobQueue.js';

/**
 * Assemblage de l'API réelle : dépôts Prisma, horloge système, e-mails déposés dans la file.
 * Seul endroit qui choisit les implémentations ; les tests assemblent les leurs (tests/factories.ts).
 */
export const createDependencies = (queue: JobQueue): AppDependencies => {
  const now = () => new Date();
  const email = createQueuedEmailSender(queue);
  const notifier = createNotifier(queue);
  const media = selectMediaStorage(env);
  const sessions = createSessionsService(sessionsRepository, now);
  const verification = createVerificationService(verificationRepository, now, simulateConfirmations);
  const categories = createCategoriesService(categoriesRepository);
  const products = createProductsService(productsRepository, categories, now);
  const deliveryZones = createDeliveryZonesService(deliveryZonesRepository);
  const publicPromoCodes = createPublicPromoCodesService(promoCodesRepository, now);
  const settings = createSettingsService({
    information: informationRepository,
    loyalty: loyaltyRepository,
    returnWindowDays: env.RETURN_WINDOW_DAYS,
    reopenWindowDays: env.RETURN_REOPEN_DAYS,
  });
  const analytics = createAnalyticsService({ analytics: analyticsRepository, information: informationRepository, now });
  return {
    now,
    health: createHealthService(healthRepository),
    auth: createAuthService({
      customers: customersRepository,
      sessions,
      verification,
      email,
      appUrl: env.APP_URL,
      now,
    }),
    staffAuth: createStaffAuthService({ staff: staffRepository, sessions, verification, email, now }),
    categories,
    products,
    deliveryZones,
    account: createAccountService({ customers: customersRepository, account: accountRepository }),
    orders: createOrdersService({
      orders: ordersRepository,
      accounts: { emailOf: async (id) => (await customersRepository.findById(id))?.email ?? null },
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
    staffPayments: createStaffPaymentsService(
      ordersRepository,
      paymentsRepository,
      returnsRepository,
      now,
    ),
    returns: createReturnsService({
      orders: ordersRepository,
      returns: returnsRepository,
      media,
      windowDays: env.RETURN_WINDOW_DAYS,
      reopenDays: env.RETURN_REOPEN_DAYS,
      shops: shopsRepository,
      notifier,
      appUrl: env.APP_URL,
      now,
    }),
    staffReturns: createStaffReturnsService(returnsRepository, ordersRepository),
    publicPromoCodes,
    settings,
    invoices: createInvoicesService(invoicesRepository, ordersRepository, now),
    staffPromoCodes: createStaffPromoCodesService(promoCodesRepository, now),
    staffStock: createStaffStockService(stockRepository),
    staffCatalog: createStaffCatalogService(staffCatalogRepository),
    payouts: createPayoutsService(payoutsRepository, now),
    sellerDelivery: createSellerDeliveryService({
      delivery: sellerDeliveryRepository,
      shops: shopsRepository,
      zones: deliveryZonesRepository,
    }),
    sellerOrders: createSellerOrdersService({
      orders: ordersRepository,
      shops: shopsRepository,
      payments: paymentsRepository,
      notifier,
      appUrl: env.APP_URL,
      now,
    }),
    sellerProducts: createSellerProductsService({
      catalog: staffCatalogRepository,
      shops: shopsRepository,
      stock: stockRepository,
      queue,
      media,
      now,
    }),
    staffCategories: createStaffCategoriesService(staffCategoriesRepository),
    staffZones: createStaffZonesService(staffZonesRepository),
    // Seule la clé publique sert à l'API : la clé privée n'est lue que par le worker, qui envoie
    notifications: createNotificationsService(notificationsRepository, env.VAPID_PUBLIC_KEY ?? null),
    staffMedia: createStaffMediaService(media, now),
    content: createContentService({ content: contentRepository }),
    staffActivity: createStaffActivityService({ activity: staffActivityRepository, now }),
    analytics,
    shopAssistant: createShopAssistantService({
      assistant: selectShopAssistant(env),
      products,
      categories,
      zones: deliveryZones,
      settings,
      promoCodes: publicPromoCodes,
      analytics,
    }),
    staffAssistant: createStaffAssistantService({ assistant: staffAssistantRepository, now }),
    emailDeliveries: createEmailDeliveriesService({ deliveries: emailDeliveriesRepository, email }),
    staffAlerts: createStaffAlertsService({
      alerts: staffAlertsRepository,
      information: informationRepository,
      notifier,
      appUrl: env.APP_URL,
      now,
    }),
    zoneRequests: createZoneRequestsService({ requests: zoneRequestsRepository, notifier, appUrl: env.APP_URL }),
    staffTeam: createStaffTeamService({ team: staffTeamRepository, email, appUrl: env.APP_URL, now }),
    staffCustomers: createStaffCustomersService({ customers: staffCustomersRepository }),
    reviews: createReviewsService({ reviews: reviewsRepository, customers: customersRepository, media, now }),
    shops: createShopsService({
      shops: shopsRepository,
      email,
      notifier,
      appUrl: env.APP_URL,
      now,
    }),
    staffShops: createStaffShopsService({ shops: shopsRepository, email, notifier, appUrl: env.APP_URL, now }),
    sellerDashboard: createSellerDashboardService({
      dashboard: sellerDashboardRepository,
      shops: shopsRepository,
      now,
    }),
  };
};
