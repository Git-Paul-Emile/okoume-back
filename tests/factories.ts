import { createApp } from '../src/app.js';
import { createPrivacyService } from '../src/features/privacy/privacy.service.js';
import { createMemoryPrivacy } from './memoryPrivacy.js';
import { createReviewsService } from '../src/features/reviews/reviews.service.js';
import { createMemoryReviews } from './memoryReviews.js';
import { createContentService } from '../src/features/content/content.service.js';
import { createMemoryContent } from './memoryContent.js';
import { createStaffCustomersService } from '../src/features/staff-customers/staff-customers.service.js';
import { createMemoryStaffCustomers } from './memoryStaffCustomers.js';
import { createStaffTeamService } from '../src/features/staff-team/staff-team.service.js';
import { createMemoryStaffTeam } from './memoryStaffTeam.js';
import { createZoneRequestsService } from '../src/features/zone-requests/zone-requests.service.js';
import { createMemoryZoneRequests } from './memoryZoneRequests.js';
import { createStaffActivityService } from '../src/features/staff-activity/staff-activity.service.js';
import { createMemoryStaffActivity } from './memoryStaffActivity.js';
import { createStaffAlertsService } from '../src/features/staff-alerts/staff-alerts.service.js';
import { createMemoryStaffAlerts } from './memoryStaffAlerts.js';
import { createEmailDeliveriesService } from '../src/features/email-deliveries/email-deliveries.service.js';
import { createMemoryEmailDeliveries } from './memoryEmailDeliveries.js';
import { createStaffAssistantService } from '../src/features/staff-assistant/staff-assistant.service.js';
import { createMemoryStaffAssistant } from './memoryStaffAssistant.js';
import { createAnalyticsService } from '../src/features/analytics/analytics.service.js';
import { createShopAssistantService } from '../src/features/shop-assistant/shop-assistant.service.js';
import {
  ShopAssistantUnavailableError,
  type ShopAssistantAnswer,
  type ShopAssistantRequest,
} from '../src/infrastructure/ai/shopAssistant.js';
import { createMemoryAnalytics } from './memoryAnalytics.js';
import { createPublicPromoCodesService } from '../src/features/promo-codes/promo-codes.service.js';
import { createSettingsService } from '../src/features/settings/settings.service.js';
import { createMemoryInformation } from './memorySettings.js';
import { createAccountService } from '../src/features/account/account.service.js';
import { createMemoryAccount } from './memoryAccount.js';
import { createAuthService } from '../src/features/auth/auth.service.js';
import { createCategoriesService } from '../src/features/categories/categories.service.js';
import { createDeliveryZonesService } from '../src/features/delivery-zones/delivery-zones.service.js';
import { createHealthService } from '../src/features/health/health.service.js';
import { createOrdersService } from '../src/features/orders/orders.service.js';
import { createProductsService } from '../src/features/products/products.service.js';
import { createStaffCouriersService } from '../src/features/staff-couriers/staff-couriers.service.js';
import { createStaffOrdersService } from '../src/features/staff-orders/staff-orders.service.js';
import { createStaffPaymentsService } from '../src/features/staff-payments/staff-payments.service.js';
import { createReturnsService } from '../src/features/returns/returns.service.js';
import { createStaffReturnsService } from '../src/features/staff-returns/staff-returns.service.js';
import { createInvoicesService } from '../src/features/invoices/invoices.service.js';
import { createLoyaltyRewardsService } from '../src/features/loyalty-rewards/loyalty-rewards.service.js';
import { createLoyaltyService } from '../src/features/loyalty/loyalty.service.js';
import { createStaffLoyaltyService } from '../src/features/staff-loyalty/staff-loyalty.service.js';
import { createStaffPromoCodesService } from '../src/features/staff-promo-codes/staff-promo-codes.service.js';
import { createStaffStockService } from '../src/features/staff-stock/staff-stock.service.js';
import { createStaffCatalogService } from '../src/features/staff-catalog/staff-catalog.service.js';
import { createStaffCategoriesService } from '../src/features/staff-categories/staff-categories.service.js';
import { createStaffZonesService } from '../src/features/staff-delivery-zones/staff-delivery-zones.service.js';
import { createMemoryStaffCatalog } from './memoryStaffCatalog.js';
import { createSessionsService } from '../src/features/sessions/sessions.service.js';
import { createStaffAuthService } from '../src/features/staff-auth/staff-auth.service.js';
import { createFakeEmailSender } from '../src/infrastructure/email/fakeEmailSender.js';
import { createNotificationsService } from '../src/features/notifications/notifications.service.js';
import { createNotifier } from '../src/features/notifications/notifier.js';
import { createMemoryJobQueue } from '../src/infrastructure/queue/memoryJobQueue.js';
import { createMemoryNotifications } from './memoryNotifications.js';
import { createFakeMediaStorage } from '../src/infrastructure/media/fakeMediaStorage.js';
import { createStaffMediaService } from '../src/features/staff-media/staff-media.service.js';
import { createShopsService } from '../src/features/shops/shops.service.js';
import { createStaffShopsService } from '../src/features/staff-shops/staff-shops.service.js';
import { createMemoryShops } from './memoryShops.js';
import { createMemorySellerTerms } from './memorySellerTerms.js';
import { createMemorySellerDashboard } from './memorySellerDashboard.js';
import { createSellerDashboardService } from '../src/features/seller-dashboard/seller-dashboard.service.js';
import { createFakeListingReviewer } from '../src/infrastructure/ai/fakeListingReviewer.js';
import { createSellerProductsService } from '../src/features/seller-products/seller-products.service.js';
import { createProductReviewWorker } from '../src/features/seller-products/seller-products.review.js';
import { createSellerOrdersService } from '../src/features/seller-orders/seller-orders.service.js';
import { createSellerDeliveryService } from '../src/features/seller-delivery/seller-delivery.service.js';
import { createPayoutsService } from '../src/features/payouts/payouts.service.js';
import { createMemoryCatalog } from './memoryCatalog.js';
import {
  createMemoryCustomers,
  createMemorySessions,
  createMemoryStaff,
} from './memoryRepositories.js';

/** Horloge réglable : les tests avancent le temps sans attendre. */
export const createClock = (start = new Date('2026-11-03T08:00:00.000Z')) => {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
};

/** Services d'authentification sur dépôts en mémoire, avec accès aux données pour les vérifications. */
export const buildAuthServices = (clock = createClock()) => {
  const { now } = clock;
  const email = createFakeEmailSender();
  const sessionsStore = createMemorySessions(now);
  const customersStore = createMemoryCustomers();
  const staffStore = createMemoryStaff();
  const sessions = createSessionsService(sessionsStore.repository, now);
  return {
    clock,
    email,
    sessionsStore,
    customersStore,
    staffStore,
    sessions,
    auth: createAuthService({
      customers: customersStore.repository,
      sessions,
      now,
    }),
    staffAuth: createStaffAuthService({ staff: staffStore.repository, sessions, now }),
  };
};

/** Catalogue, zones et commandes en mémoire, avec accès aux données pour préparer et vérifier. */
export const buildShopServices = (clock = createClock(), email = createFakeEmailSender()) => {
  const catalog = createMemoryCatalog(clock.now);
  // Adresse e-mail des comptes clients, pour le rattachement d'une commande passée sans compte
  const accountEmails = new Map<string, string>();
  const { categoriesRepository, productsRepository, zonesRepository, ordersRepository } = catalog.repositories;
  const categories = createCategoriesService(categoriesRepository);
  const staffStore = createMemoryStaffCatalog({ ...catalog, now: clock.now });
  // Notifications push déposées dans une file en mémoire, à inspecter ou à remettre dans les tests
  const informationStore = createMemoryInformation();
  const pushQueue = createMemoryJobQueue();
  const notifier = createNotifier(pushQueue);
  const notificationsStore = createMemoryNotifications();
  const shopsStore = createMemoryShops(clock.now);
  const sellerTerms = createMemorySellerTerms(shopsStore.repository);
  const marketplace = {
    shops: shopsStore.repository,
    email,
    notifier,
    appUrl: 'http://localhost:5173',
    now: clock.now,
  };
  const reviewer = createFakeListingReviewer();
  const media = createFakeMediaStorage();
  // Membres de l'équipe connus de l'assistance (responsables, auteurs des réponses)
  const teamDirectory: Array<{ id: string; firstName: string; lastName: string }> = [];
  // Vérificateur IA des produits de vendeurs : un faux réglable
  return {
    catalog,
    pushQueue,
    notificationsStore,
    notifications: createNotificationsService(notificationsStore.repository, 'cle-publique-de-test'),
    media,
    staffMedia: createStaffMediaService(media, clock.now),
    teamDirectory,
    reviewer,
    shopsStore,
    shops: createShopsService(marketplace),
    staffShops: createStaffShopsService(marketplace),
    staffCatalogStore: staffStore,
    categories,
    products: createProductsService(productsRepository, categories, clock.now),
    deliveryZones: createDeliveryZonesService(zonesRepository),
    accountEmails,
    sellerTerms,
    orders: createOrdersService({
      orders: ordersRepository,
      sellers: sellerTerms.repository,
      accounts: { emailOf: async (id) => accountEmails.get(id) ?? null },
      products: productsRepository,
      zones: zonesRepository,
      categories,
      promoCodes: catalog.repositories.promoCodesRepository,
      email,
      notifier,
      appUrl: 'http://localhost:5173',
      now: clock.now,
    }),
    staffOrders: createStaffOrdersService({
      orders: ordersRepository,
      couriers: catalog.repositories.couriersRepository,
      zones: staffStore.zones,
      email,
      notifier,
      appUrl: 'http://localhost:5173',
      now: clock.now,
    }),
    staffCouriers: createStaffCouriersService(catalog.repositories.couriersRepository),
    staffPayments: createStaffPaymentsService(
      ordersRepository,
      catalog.repositories.paymentsRepository,
      catalog.repositories.returnsRepository,
      clock.now,
    ),
    returns: createReturnsService({
      orders: ordersRepository,
      returns: catalog.repositories.returnsRepository,
      media,
      windowDays: 14,
      reopenDays: 14,
      shops: shopsStore.repository,
      notifier,
      appUrl: 'http://localhost:5173',
      now: clock.now,
    }),
    staffReturns: createStaffReturnsService(catalog.repositories.returnsRepository, ordersRepository),
    loyalty: createLoyaltyService(catalog.repositories.loyaltyRepository),
    informationStore,
    settings: createSettingsService({
      information: informationStore.repository,
      loyalty: catalog.repositories.loyaltyRepository,
      returnWindowDays: 14,
      reopenWindowDays: 14,
    }),
    loyaltyRewards: createLoyaltyRewardsService(
      catalog.repositories.loyaltyRewardsRepository,
      catalog.repositories.loyaltyRepository,
      catalog.repositories.promoCodesRepository,
      clock.now,
    ),
    invoices: createInvoicesService(catalog.repositories.invoicesRepository, ordersRepository, clock.now),
    staffLoyalty: createStaffLoyaltyService(catalog.repositories.loyaltyRepository),
    staffPromoCodes: createStaffPromoCodesService(catalog.repositories.promoCodesRepository),
    publicPromoCodes: createPublicPromoCodesService(catalog.repositories.promoCodesRepository, clock.now),
    staffStock: createStaffStockService(catalog.repositories.stockRepository),
    staffCatalog: createStaffCatalogService(staffStore.catalog),
    payouts: createPayoutsService(catalog.repositories.payoutsRepository, clock.now),
    sellerDashboard: createSellerDashboardService({
      dashboard: createMemorySellerDashboard({ catalog: staffStore.catalog, orders: catalog.orders }).repository,
      shops: shopsStore.repository,
      now: clock.now,
    }),
    sellerDelivery: createSellerDeliveryService({
      delivery: sellerTerms.delivery,
      shops: shopsStore.repository,
      zones: zonesRepository,
    }),
    sellerOrders: createSellerOrdersService({
      orders: ordersRepository,
      shops: shopsStore.repository,
      payments: catalog.repositories.paymentsRepository,
      notifier,
      appUrl: 'http://localhost:5173',
      now: clock.now,
    }),
    sellerProducts: createSellerProductsService({
      catalog: staffStore.catalog,
      shops: shopsStore.repository,
      stock: catalog.repositories.stockRepository,
      queue: pushQueue,
      media: null,
      now: clock.now,
    }),
    productReviews: createProductReviewWorker({
      catalog: staffStore.catalog,
      shops: shopsStore.repository,
      categories: categoriesRepository,
      reviewer: reviewer.reviewer,
      notifier,
      appUrl: 'https://okoza.test',
    }),
    staffCategories: createStaffCategoriesService(staffStore.categories),
    staffZones: createStaffZonesService(staffStore.zones),
  };
};

/** Application de test : base simulée qui répond ou non, tous les dépôts en mémoire. */
export const buildApp = ({ databaseUp = true }: { databaseUp?: boolean } = {}) => {
  const auth = buildAuthServices();
  const shop = buildShopServices(auth.clock, auth.email);
  const accountStore = createMemoryAccount({
    customers: auth.customersStore.customers,
    products: shop.catalog.products,
    zones: shop.catalog.zones,
    now: auth.clock.now,
  });
  const account = createAccountService({ customers: auth.customersStore.repository, account: accountStore.repository });
  const privacyStore = createMemoryPrivacy(auth.customersStore.customers);
  const privacy = createPrivacyService({ privacy: privacyStore.repository, now: auth.clock.now });
  const reviewsStore = createMemoryReviews(auth.clock.now, () => shop.teamDirectory);
  const reviews = createReviewsService({
    reviews: reviewsStore.repository,
    customers: auth.customersStore.repository,
    media: shop.media,
    now: auth.clock.now,
  });
  const contentStore = createMemoryContent(auth.clock.now);
  const content = createContentService({ content: contentStore.repository });
  const staffCustomersStore = createMemoryStaffCustomers();
  const staffCustomers = createStaffCustomersService({
    customers: staffCustomersStore.repository,
  });
  const staffTeamStore = createMemoryStaffTeam(auth.clock.now);
  const staffTeam = createStaffTeamService({
    team: staffTeamStore.repository,
    email: auth.email,
    appUrl: 'http://localhost:5173',
    now: auth.clock.now,
  });
  const zoneRequestsStore = createMemoryZoneRequests(auth.clock.now);
  const zoneRequests = createZoneRequestsService({
    requests: zoneRequestsStore.repository,
    notifier: createNotifier(shop.pushQueue),
    appUrl: 'http://localhost:5173',
  });
  const staffActivityStore = createMemoryStaffActivity();
  const staffActivity = createStaffActivityService({ activity: staffActivityStore.repository, now: auth.clock.now });
  const staffAlertsStore = createMemoryStaffAlerts(() => shop.teamDirectory);
  const staffAlerts = createStaffAlertsService({
    alerts: staffAlertsStore.repository,
    information: shop.informationStore.repository,
    notifier: createNotifier(shop.pushQueue),
    appUrl: 'http://localhost:5173',
    now: auth.clock.now,
  });
  const emailDeliveriesStore = createMemoryEmailDeliveries(auth.clock.now);
  const emailDeliveries = createEmailDeliveriesService({
    deliveries: emailDeliveriesStore.repository,
    email: auth.email,
  });
  const staffAssistantStore = createMemoryStaffAssistant(auth.clock.now, () => shop.teamDirectory);
  const staffAssistant = createStaffAssistantService({
    assistant: staffAssistantStore.repository,
    now: auth.clock.now,
  });
  const analyticsStore = createMemoryAnalytics();
  const analytics = createAnalyticsService({
    analytics: analyticsStore.repository,
    information: shop.informationStore.repository,
    now: auth.clock.now,
  });
  // Faux fournisseur d'IA : les tests fixent sa réponse et lisent la dernière demande
  const shopAssistantFake = {
    requests: [] as ShopAssistantRequest[],
    reply: { reply: 'Bonjour', productSlugs: [] as string[] } as Omit<ShopAssistantAnswer, 'model'> | 'down',
    async answer(request: ShopAssistantRequest): Promise<ShopAssistantAnswer> {
      this.requests.push(request);
      if (this.reply === 'down') throw new ShopAssistantUnavailableError();
      return { ...this.reply, model: 'faux' };
    },
  };
  const shopAssistant = createShopAssistantService({
    assistant: shopAssistantFake,
    products: shop.products,
    categories: shop.categories,
    zones: shop.deliveryZones,
    settings: shop.settings,
    promoCodes: shop.publicPromoCodes,
    analytics,
  });
  const services = {
    ...auth,
    shopAssistantFake,
    ...shop,
    accountStore,
    account,
    privacyStore,
    privacy,
    reviewsStore,
    reviews,
    contentStore,
    content,
    staffCustomersStore,
    staffCustomers,
    staffTeamStore,
    staffTeam,
    zoneRequestsStore,
    zoneRequests,
    staffActivityStore,
    staffActivity,
    staffAlertsStore,
    staffAlerts,
    emailDeliveriesStore,
    emailDeliveries,
    staffAssistantStore,
    staffAssistant,
    analyticsStore,
    analytics,
  };
  const app = createApp({
    now: services.clock.now,
    auth: services.auth,
    account,
    settings: shop.settings,
    publicPromoCodes: shop.publicPromoCodes,
    reviews,
    content,
    staffCustomers,
    staffTeam,
    zoneRequests,
    staffActivity,
    staffAlerts,
    emailDeliveries,
    staffAssistant,
    shopAssistant,
    analytics,
    staffAuth: services.staffAuth,
    categories: shop.categories,
    products: shop.products,
    deliveryZones: shop.deliveryZones,
    orders: shop.orders,
    staffOrders: shop.staffOrders,
    staffCouriers: shop.staffCouriers,
    staffPayments: shop.staffPayments,
    returns: shop.returns,
    staffReturns: shop.staffReturns,
    invoices: shop.invoices,
    staffPromoCodes: shop.staffPromoCodes,
    staffStock: shop.staffStock,
    staffCatalog: shop.staffCatalog,
    sellerProducts: shop.sellerProducts,
    sellerOrders: shop.sellerOrders,
    sellerDelivery: shop.sellerDelivery,
    payouts: shop.payouts,
    staffCategories: shop.staffCategories,
    staffZones: shop.staffZones,
    notifications: shop.notifications,
    staffMedia: shop.staffMedia,
    shops: shop.shops,
    staffShops: shop.staffShops,
    sellerDashboard: shop.sellerDashboard,
    health: createHealthService({
      pingDatabase: () => (databaseUp ? Promise.resolve() : Promise.reject(new Error('connexion refusée'))),
    }),
  });
  return Object.assign(app, { services });
};

type ShopServices = ReturnType<typeof buildShopServices>;
type StaffOrdersActor = Parameters<ShopServices['staffOrders']['transition']>[2];

/**
 * Mène une commande jusqu'à « Livrée » comme le ferait l'équipe : préparation, prête, affectation d'un
 * livreur du répertoire (créé au besoin), départ, livraison.
 */
export async function deliverOrder(shop: ShopServices, orderId: string, actor: StaffOrdersActor) {
  const courier =
    shop.catalog.couriers[0] ??
    (await shop.staffCouriers.create(
      {
        firstName: 'Junior',
        lastName: 'Mba',
        phone: '074123456',
        email: 'junior.mba@example.ga',
        vehicle: 'moto',
        active: true,
        notes: '',
        zoneIds: [],
      },
      actor,
    ));
  // Commande signalée (commandes répétées dans un même test, par exemple) : l'équipe la vérifie d'abord
  if ((await shop.staffOrders.get(orderId)).review?.status === 'pending')
    await shop.staffOrders.clearReview(orderId, 'Vérification faite dans le test', actor);
  await shop.staffOrders.transition(orderId, { action: 'advance' }, actor);
  await shop.staffOrders.transition(orderId, { action: 'advance' }, actor);
  await shop.staffOrders.transition(orderId, { action: 'assign_courier', courierId: courier.id }, actor);
  await shop.staffOrders.transition(orderId, { action: 'advance' }, actor);
  return shop.staffOrders.transition(orderId, { action: 'advance' }, actor);
}
