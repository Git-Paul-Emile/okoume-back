import { env } from './config/env.js';
import { selectEmailSender } from './infrastructure/email/selectEmailSender.js';
import {
  createPgBoss,
  createPgBossJobQueue,
  deadLetterOf,
  startQueue,
  queueConnectionString,
  registerHandler,
  scheduleDaily,
} from './infrastructure/queue/pgBossQueue.js';
import { createDeadEmailHandler, createSendEmailHandler } from './jobs/email.jobs.js';
import { createDeadJobHandler } from './jobs/dead.jobs.js';
import { emailDeliveriesRepository } from './features/email-deliveries/email-deliveries.repository.js';
import { logger } from './lib/logger.js';
import { shopsRepository } from './features/shops/shops.repository.js';
import { createShopsService } from './features/shops/shops.service.js';
import { createNotifier } from './features/notifications/notifier.js';
import { createQueuedEmailSender } from './infrastructure/email/queuedEmailSender.js';
import { createAccessRemindersHandler } from './jobs/shops.jobs.js';
import { selectListingReviewer } from './infrastructure/ai/selectListingReviewer.js';
import { createProductReviewWorker } from './features/seller-products/seller-products.review.js';
import { createDeadProductReviewHandler, createProductReviewHandler } from './jobs/products.jobs.js';
import { staffCatalogRepository } from './features/staff-catalog/staff-catalog.repository.js';
import { categoriesRepository } from './features/categories/categories.repository.js';
import { privacyRepository } from './features/privacy/privacy.repository.js';
import { createPrivacyService } from './features/privacy/privacy.service.js';
import { createInactiveAccountsHandler } from './jobs/privacy.jobs.js';
import { staffAlertsRepository } from './features/staff-alerts/staff-alerts.repository.js';
import { createStaffAlertsService } from './features/staff-alerts/staff-alerts.service.js';
import { informationRepository } from './features/settings/settings.repository.js';
import { createAlertsDetectionHandler } from './jobs/alerts.jobs.js';
import { analyticsRepository } from './features/analytics/analytics.repository.js';
import { createAnalyticsService } from './features/analytics/analytics.service.js';
import { createAnalyticsPurgeHandler } from './jobs/analytics.jobs.js';
import { selectErrorReporter } from './infrastructure/monitoring/selectErrorReporter.js';
import { errorReporter, setErrorReporter } from './lib/errorReporting.js';

// Supervision branchée avant tout : une erreur de démarrage est déjà remontée
setErrorReporter(selectErrorReporter(env, 'worker'));

/** Délai laissé aux jobs en cours pour finir avant l'arrêt : au-delà du délai d'un envoi (60 s). */
const SHUTDOWN_TIMEOUT_MS = 75_000;
const EMAIL_CONCURRENCY = 2;
// Appels au modèle en parallèle : limite le débit vers le fournisseur et le coût d'une rafale
const REVIEW_CONCURRENCY = 2;

/**
 * Processus des traitements différés, séparé de l'API : une rafale d'e-mails ne ralentit pas les
 * requêtes, et chaque processus se dimensionne à part. Il surveille aussi les files (supervision).
 */
const boss = createPgBoss(queueConnectionString(env), 'worker');

try {
  await startQueue(boss, queueConnectionString(env));
  const email = selectEmailSender(env);
  await registerHandler(
    boss,
    'email.send',
    createSendEmailHandler(email, emailDeliveriesRepository, () => new Date()),
    EMAIL_CONCURRENCY,
  );
  await registerHandler(boss, deadLetterOf('email.send'), createDeadEmailHandler(emailDeliveriesRepository));
  // Rappels aux vendeurs : e-mails et notifications passent par la file, avec ses reprises
  const queue = createPgBossJobQueue(boss);
  const shops = createShopsService({
    shops: shopsRepository,
    email: createQueuedEmailSender(queue),
    notifier: createNotifier(queue),
    appUrl: env.APP_URL,
    now: () => new Date(),
  });
  await registerHandler(boss, 'shops.access-reminders', createAccessRemindersHandler(shops));
  await registerHandler(boss, deadLetterOf('shops.access-reminders'), createDeadJobHandler('shops.access-reminders'));
  // Chaque matin à 8 h (heure de Libreville)
  await scheduleDaily(boss, 'shops.access-reminders', '0 8 * * *', {});
  // Durées de conservation (19.5) : comptes sans connexion ni commande depuis 3 ans anonymisés
  const privacy = createPrivacyService({
    privacy: privacyRepository,
    now: () => new Date(),
  });
  await registerHandler(boss, 'privacy.inactive-accounts', createInactiveAccountsHandler(privacy));
  await registerHandler(
    boss,
    deadLetterOf('privacy.inactive-accounts'),
    createDeadJobHandler('privacy.inactive-accounts'),
  );
  // Chaque nuit à 3 h (heure de Libreville), hors des heures d'achat
  await scheduleDaily(boss, 'privacy.inactive-accounts', '0 3 * * *', {});
  // Alertes de l'équipe : détection périodique et relances
  const alerts = createStaffAlertsService({
    alerts: staffAlertsRepository,
    information: informationRepository,
    notifier: createNotifier(queue),
    appUrl: env.APP_URL,
    now: () => new Date(),
  });
  await registerHandler(boss, 'alerts.detect', createAlertsDetectionHandler(alerts));
  await registerHandler(boss, deadLetterOf('alerts.detect'), createDeadJobHandler('alerts.detect'));
  await scheduleDaily(boss, 'alerts.detect', '*/15 * * * *', {});
  // Historique de navigation : supprimé après 13 mois, chaque nuit à 3 h 30
  const analytics = createAnalyticsService({
    analytics: analyticsRepository,
    information: informationRepository,
    now: () => new Date(),
  });
  await registerHandler(boss, 'analytics.purge', createAnalyticsPurgeHandler(analytics));
  await registerHandler(boss, deadLetterOf('analytics.purge'), createDeadJobHandler('analytics.purge'));
  await scheduleDaily(boss, 'analytics.purge', '30 3 * * *', {});
  // Vérification des produits des vendeurs : sans clé Gemini ni Anthropic, chaque produit va en modération humaine
  if (!env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY)
    logger.warn('Vérification des produits par IA désactivée : aucune clé Gemini ni Anthropic');
  // Produits des vendeurs : même vérificateur ; sans clé d'IA, chaque produit va en modération humaine
  const productReviews = createProductReviewWorker({
    catalog: staffCatalogRepository,
    shops: shopsRepository,
    categories: categoriesRepository,
    reviewer: selectListingReviewer(env),
    notifier: createNotifier(queue),
    appUrl: env.APP_URL,
  });
  await registerHandler(boss, 'products.review', createProductReviewHandler(productReviews), REVIEW_CONCURRENCY);
  await registerHandler(boss, deadLetterOf('products.review'), createDeadProductReviewHandler(productReviews));
  logger.info('Worker démarré');
} catch (err) {
  logger.fatal({ err }, 'Démarrage du worker impossible');
  await errorReporter().flush(2_000);
  process.exit(1);
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'Arrêt du worker demandé');
  await boss.stop({ graceful: true, timeout: SHUTDOWN_TIMEOUT_MS });
  await errorReporter().flush(2_000);
  logger.info('Worker arrêté');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Promesse rejetée sans traitement');
  void shutdown('unhandledRejection');
});
