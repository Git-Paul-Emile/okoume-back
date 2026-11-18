import { Router } from 'express';
import { createAccountRoutes } from './features/account/account.routes.js';
import { createPublicSettingsRoutes, createStaffSettingsRoutes } from './features/settings/settings.routes.js';
import type { SettingsService } from './features/settings/settings.service.js';
import { createPublicPromoCodesRoutes } from './features/promo-codes/promo-codes.routes.js';
import { createStaffSupportRoutes, createSupportRoutes } from './features/support/support.routes.js';
import { createPrivacyRoutes, createStaffPrivacyRoutes } from './features/privacy/privacy.routes.js';
import type { PrivacyService } from './features/privacy/privacy.service.js';
import { createReviewsRoutes, createStaffReviewsRoutes } from './features/reviews/reviews.routes.js';
import type { ReviewsService } from './features/reviews/reviews.service.js';
import { createContentRoutes, createStaffContentRoutes } from './features/content/content.routes.js';
import type { ContentService } from './features/content/content.service.js';
import { createStaffCustomersRoutes } from './features/staff-customers/staff-customers.routes.js';
import type { StaffCustomersService } from './features/staff-customers/staff-customers.service.js';
import { createCustomRolesRoutes, createStaffTeamRoutes } from './features/staff-team/staff-team.routes.js';
import type { StaffTeamService } from './features/staff-team/staff-team.service.js';
import {
  createStaffZoneRequestsRoutes,
  createZoneRequestsRoutes,
} from './features/zone-requests/zone-requests.routes.js';
import type { ZoneRequestsService } from './features/zone-requests/zone-requests.service.js';
import { recordStaffActivity } from './features/staff-activity/staff-activity.middleware.js';
import {
  createStaffActivityRoutes,
  createStaffExportsRoutes,
} from './features/staff-activity/staff-activity.routes.js';
import type { StaffActivityService } from './features/staff-activity/staff-activity.service.js';
import { createStaffAlertsRoutes } from './features/staff-alerts/staff-alerts.routes.js';
import type { StaffAlertsService } from './features/staff-alerts/staff-alerts.service.js';
import { createEmailDeliveriesRoutes } from './features/email-deliveries/email-deliveries.routes.js';
import type { EmailDeliveriesService } from './features/email-deliveries/email-deliveries.service.js';
import { createStaffAssistantRoutes } from './features/staff-assistant/staff-assistant.routes.js';
import type { StaffAssistantService } from './features/staff-assistant/staff-assistant.service.js';
import { createShopAssistantRoutes } from './features/shop-assistant/shop-assistant.routes.js';
import type { ShopAssistantService } from './features/shop-assistant/shop-assistant.service.js';
import { createAnalyticsRoutes, createStaffAnalyticsRoutes } from './features/analytics/analytics.routes.js';
import type { AnalyticsService } from './features/analytics/analytics.service.js';
import type { SupportService } from './features/support/support.service.js';
import type { PublicPromoCodesService } from './features/promo-codes/promo-codes.service.js';
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
import { createPaymentsRoutes } from './features/payments/payments.routes.js';
import type { PaymentsService } from './features/payments/payments.service.js';
import { createStaffPaymentsRoutes } from './features/staff-payments/staff-payments.routes.js';
import type { StaffPaymentsService } from './features/staff-payments/staff-payments.service.js';
import { createReturnsRoutes } from './features/returns/returns.routes.js';
import type { ReturnsService } from './features/returns/returns.service.js';
import { createStaffReturnsRoutes, createWriteOffRoutes } from './features/staff-returns/staff-returns.routes.js';
import type { StaffReturnsService } from './features/staff-returns/staff-returns.service.js';
import { createOrderInvoicesRoutes, createStaffInvoicesRoutes } from './features/invoices/invoices.routes.js';
import type { InvoicesService } from './features/invoices/invoices.service.js';
import {
  createCustomerRewardsRoutes,
  createStaffReferralRoutes,
} from './features/loyalty-rewards/loyalty-rewards.routes.js';
import type { LoyaltyRewardsService } from './features/loyalty-rewards/loyalty-rewards.service.js';
import { createLoyaltyRoutes } from './features/loyalty/loyalty.routes.js';
import type { LoyaltyService } from './features/loyalty/loyalty.service.js';
import { createStaffLoyaltyRoutes } from './features/staff-loyalty/staff-loyalty.routes.js';
import type { StaffLoyaltyService } from './features/staff-loyalty/staff-loyalty.service.js';
import { createStaffPromoCodesRoutes } from './features/staff-promo-codes/staff-promo-codes.routes.js';
import type { StaffPromoCodesService } from './features/staff-promo-codes/staff-promo-codes.service.js';
import { createProductsRoutes } from './features/products/products.routes.js';
import type { ProductsService } from './features/products/products.service.js';
import { createStaffAuthRoutes } from './features/staff-auth/staff-auth.routes.js';
import { createStaffCouriersRoutes } from './features/staff-couriers/staff-couriers.routes.js';
import type { StaffCouriersService } from './features/staff-couriers/staff-couriers.service.js';
import {
  createStaffCatalogRoutes,
  createStaffPriceChangesRoutes,
} from './features/staff-catalog/staff-catalog.routes.js';
import type { StaffCatalogService } from './features/staff-catalog/staff-catalog.service.js';
import { createStaffCategoriesRoutes } from './features/staff-categories/staff-categories.routes.js';
import type { StaffCategoriesService } from './features/staff-categories/staff-categories.service.js';
import { createStaffZonesRoutes } from './features/staff-delivery-zones/staff-delivery-zones.routes.js';
import type { StaffZonesService } from './features/staff-delivery-zones/staff-delivery-zones.service.js';
import { createStaffOrdersRoutes } from './features/staff-orders/staff-orders.routes.js';
import type { StaffOrdersService } from './features/staff-orders/staff-orders.service.js';
import { createStaffStockJournalRoutes, createStaffStockRoutes } from './features/staff-stock/staff-stock.routes.js';
import type { StaffStockService } from './features/staff-stock/staff-stock.service.js';
import type { StaffAuthService } from './features/staff-auth/staff-auth.service.js';
import {
  createCustomerPushRoutes,
  createPreferencesRoutes,
  createStaffPushRoutes,
} from './features/notifications/notifications.routes.js';
import type { NotificationsService } from './features/notifications/notifications.service.js';
import { createStaffMediaRoutes } from './features/staff-media/staff-media.routes.js';
import type { StaffMediaService } from './features/staff-media/staff-media.service.js';
import {
  createAccessPlansRoutes,
  createPublicShopsRoutes,
  createSellerShopRoutes,
} from './features/shops/shops.routes.js';
import type { ShopsService } from './features/shops/shops.service.js';
import { createStaffMarketplaceRoutes } from './features/staff-shops/staff-shops.routes.js';
import type { StaffShopsService } from './features/staff-shops/staff-shops.service.js';
import {
  createPublicListingsRoutes,
  createSellerListingsRoutes,
  createShopListingsRoutes,
} from './features/listings/listings.routes.js';
import type { ListingsService } from './features/listings/listings.service.js';
import { createStaffListingsRoutes } from './features/staff-listings/staff-listings.routes.js';
import type { StaffListingsService } from './features/staff-listings/staff-listings.service.js';
import {
  createBuyerRequestsRoutes,
  createSellerRequestsRoutes,
} from './features/listing-requests/listing-requests.routes.js';
import type { ListingRequestsService } from './features/listing-requests/listing-requests.service.js';
import { createBuyerChatRoutes, createSellerChatRoutes } from './features/chat/chat.routes.js';
import type { ChatService } from './features/chat/chat.service.js';
import { createSellerDashboardRoutes } from './features/seller-dashboard/seller-dashboard.routes.js';
import type { SellerDashboardService } from './features/seller-dashboard/seller-dashboard.service.js';
import { createBoostPlansRoutes, createSellerBoostsRoutes } from './features/boosts/boosts.routes.js';
import type { BoostsService } from './features/boosts/boosts.service.js';
import { createStaffBoostsRoutes } from './features/staff-boosts/staff-boosts.routes.js';
import type { StaffBoostsService } from './features/staff-boosts/staff-boosts.service.js';

export interface ApiServices {
  auth: AuthService;
  account: AccountService;
  settings: SettingsService;
  publicPromoCodes: PublicPromoCodesService;
  support: SupportService;
  privacy: PrivacyService;
  reviews: ReviewsService;
  content: ContentService;
  staffCustomers: StaffCustomersService;
  staffTeam: StaffTeamService;
  zoneRequests: ZoneRequestsService;
  staffActivity: StaffActivityService;
  staffAlerts: StaffAlertsService;
  emailDeliveries: EmailDeliveriesService;
  staffAssistant: StaffAssistantService;
  shopAssistant: ShopAssistantService;
  analytics: AnalyticsService;
  staffAuth: StaffAuthService;
  categories: CategoriesService;
  products: ProductsService;
  deliveryZones: DeliveryZonesService;
  orders: OrdersService;
  staffOrders: StaffOrdersService;
  staffCouriers: StaffCouriersService;
  payments: PaymentsService;
  returns: ReturnsService;
  loyalty: LoyaltyService;
  loyaltyRewards: LoyaltyRewardsService;
  invoices: InvoicesService;
  staffLoyalty: StaffLoyaltyService;
  staffPromoCodes: StaffPromoCodesService;
  staffReturns: StaffReturnsService;
  staffPayments: StaffPaymentsService;
  staffStock: StaffStockService;
  staffCatalog: StaffCatalogService;
  staffCategories: StaffCategoriesService;
  staffZones: StaffZonesService;
  notifications: NotificationsService;
  staffMedia: StaffMediaService;
  shops: ShopsService;
  staffShops: StaffShopsService;
  listings: ListingsService;
  staffListings: StaffListingsService;
  listingRequests: ListingRequestsService;
  chat: ChatService;
  sellerDashboard: SellerDashboardService;
  boosts: BoostsService;
  staffBoosts: StaffBoostsService;
  now: () => Date;
}

/**
 * Registre central des routes métier, montées sous /api/v1. Chaque fonctionnalité y branche
 * son routeur au fur et à mesure de sa création.
 */
export const createApiRoutes = (services: ApiServices) => {
  const router = Router();
  // Avant toute route de l'équipe : chaque écriture réussie d'un membre est inscrite au journal
  router.use('/staff', recordStaffActivity(services.staffActivity));
  router.use('/auth', createAuthRoutes(services.auth, services.now));
  router.use('/me', createAccountRoutes(services.account, services.now));
  router.use('/me', createPrivacyRoutes(services.privacy, services.now));
  router.use('/settings', createPublicSettingsRoutes(services.settings));
  router.use('/promo-codes', createPublicPromoCodesRoutes(services.publicPromoCodes));
  router.use('/assistant', createShopAssistantRoutes(services.shopAssistant));
  router.use('/support', createSupportRoutes(services.support, services.now));
  router.use('/staff/support/tickets', createStaffSupportRoutes(services.support, services.staffAuth, services.now));
  router.use('/reviews', createReviewsRoutes(services.reviews, services.now));
  router.use('/content', createContentRoutes(services.content));
  router.use('/staff/customers', createStaffCustomersRoutes(services.staffCustomers, services.staffAuth, services.now));
  router.use('/zone-requests', createZoneRequestsRoutes(services.zoneRequests));
  router.use(
    '/staff/zone-requests',
    createStaffZoneRequestsRoutes(services.zoneRequests, services.staffAuth, services.now),
  );
  router.use('/', createAnalyticsRoutes(services.analytics));
  router.use('/staff/analytics', createStaffAnalyticsRoutes(services.analytics, services.staffAuth, services.now));
  router.use('/staff/assistant', createStaffAssistantRoutes(services.staffAssistant, services.staffAuth, services.now));
  router.use('/staff/emails', createEmailDeliveriesRoutes(services.emailDeliveries, services.staffAuth, services.now));
  router.use('/staff/alerts', createStaffAlertsRoutes(services.staffAlerts, services.staffAuth, services.now));
  router.use('/staff/activity', createStaffActivityRoutes(services.staffActivity, services.staffAuth, services.now));
  router.use('/staff/exports', createStaffExportsRoutes(services.staffActivity, services.staffAuth, services.now));
  router.use('/staff/team', createStaffTeamRoutes(services.staffTeam, services.staffAuth, services.now));
  router.use('/staff/custom-roles', createCustomRolesRoutes(services.staffTeam, services.staffAuth, services.now));
  router.use('/staff/content', createStaffContentRoutes(services.content, services.staffAuth, services.now));
  router.use('/staff/reviews', createStaffReviewsRoutes(services.reviews, services.staffAuth, services.now));
  router.use('/staff/privacy-requests', createStaffPrivacyRoutes(services.privacy, services.staffAuth, services.now));
  router.use('/staff/settings/shop', createStaffSettingsRoutes(services.settings, services.staffAuth, services.now));
  router.use('/staff/auth', createStaffAuthRoutes(services.staffAuth, services.now));
  router.use('/categories', createCategoriesRoutes(services.categories));
  router.use('/products', createProductsRoutes(services.products));
  router.use('/delivery-zones', createDeliveryZonesRoutes(services.deliveryZones));
  router.use('/orders', createOrdersRoutes(services.orders, services.now));
  router.use('/orders', createPaymentsRoutes(services.payments, services.now));
  router.use('/orders', createReturnsRoutes(services.returns, services.now));
  router.use('/order-tracking', createOrderTrackingRoutes(services.orders));
  router.use('/checkout', createCheckoutRoutes(services.orders, services.now));
  router.use('/loyalty', createCustomerRewardsRoutes(services.loyaltyRewards, services.now));
  router.use('/loyalty', createLoyaltyRoutes(services.loyalty, services.now));
  router.use('/orders', createOrderInvoicesRoutes(services.invoices, services.now));
  // Paiements avant les commandes : leurs routes /staff/orders/:id/payments ne passent pas par le droit commandes:consulter
  router.use('/staff/orders', createStaffPaymentsRoutes(services.staffPayments, services.staffAuth, services.now));
  router.use('/staff/orders', createStaffOrdersRoutes(services.staffOrders, services.staffAuth, services.now));
  router.use(
    '/staff/promo-codes',
    createStaffPromoCodesRoutes(services.staffPromoCodes, services.staffAuth, services.now),
  );
  router.use('/staff', createStaffLoyaltyRoutes(services.staffLoyalty, services.staffAuth, services.now));
  router.use('/staff/couriers', createStaffCouriersRoutes(services.staffCouriers, services.staffAuth, services.now));
  router.use(
    '/staff/referral-rewards',
    createStaffReferralRoutes(services.loyaltyRewards, services.staffAuth, services.now),
  );
  router.use('/staff/invoices', createStaffInvoicesRoutes(services.invoices, services.staffAuth, services.now));
  router.use('/staff/returns', createStaffReturnsRoutes(services.staffReturns, services.staffAuth, services.now));
  // Sortie définitive avant le stock : sa route ne passe pas par le droit stock:consulter du routeur du stock
  router.use('/staff/variants', createWriteOffRoutes(services.staffReturns, services.staffAuth, services.now));
  router.use('/staff/variants', createStaffStockRoutes(services.staffStock, services.staffAuth, services.now));
  router.use(
    '/staff/stock-movements',
    createStaffStockJournalRoutes(services.staffStock, services.staffAuth, services.now),
  );
  router.use('/staff/products', createStaffCatalogRoutes(services.staffCatalog, services.staffAuth, services.now));
  router.use(
    '/staff/price-changes',
    createStaffPriceChangesRoutes(services.staffCatalog, services.staffAuth, services.now),
  );
  router.use(
    '/staff/categories',
    createStaffCategoriesRoutes(services.staffCategories, services.staffAuth, services.now),
  );
  router.use('/staff/delivery-zones', createStaffZonesRoutes(services.staffZones, services.staffAuth, services.now));
  router.use('/push', createCustomerPushRoutes(services.notifications, services.now));
  router.use('/notification-preferences', createPreferencesRoutes(services.notifications, services.now));
  router.use('/staff/push', createStaffPushRoutes(services.notifications, services.staffAuth, services.now));
  router.use('/staff/media', createStaffMediaRoutes(services.staffMedia, services.staffAuth, services.now));
  // Place de marché (section 32)
  router.use('/access-plans', createAccessPlansRoutes(services.shops));
  router.use('/shops', createPublicShopsRoutes(services.shops));
  router.use('/seller/shop', createSellerShopRoutes(services.shops, services.now));
  const marketplace = createStaffMarketplaceRoutes(services.staffShops, services.staffAuth, services.now);
  router.use('/staff/access-plans', marketplace.plans);
  router.use('/staff/shops', marketplace.shops);
  router.use('/staff/shop-payments', marketplace.payments);
  router.use('/staff/settings/marketplace', marketplace.settings);
  router.use('/shops', createShopListingsRoutes(services.listings));
  router.use('/listings', createPublicListingsRoutes(services.listings, services.now));
  router.use('/seller/listings', createSellerListingsRoutes(services.listings, services.now));
  const moderation = createStaffListingsRoutes(services.staffListings, services.staffAuth, services.now);
  router.use('/staff/listings', moderation.listings);
  router.use('/staff/listing-reports', moderation.reports);
  router.use('/listing-requests', createBuyerRequestsRoutes(services.listingRequests, services.now));
  router.use('/seller/listing-requests', createSellerRequestsRoutes(services.listingRequests, services.now));
  router.use('/conversations', createBuyerChatRoutes(services.chat, services.now));
  router.use('/seller/conversations', createSellerChatRoutes(services.chat, services.now));
  router.use('/seller/dashboard', createSellerDashboardRoutes(services.sellerDashboard, services.now));
  // Mise en avant payante (32.10)
  router.use('/boost-plans', createBoostPlansRoutes(services.boosts));
  router.use('/seller', createSellerBoostsRoutes(services.boosts, services.now));
  const promotion = createStaffBoostsRoutes(services.staffBoosts, services.staffAuth, services.now);
  router.use('/staff/boost-plans', promotion.plans);
  router.use('/staff/boosts', promotion.boosts);
  return router;
};
