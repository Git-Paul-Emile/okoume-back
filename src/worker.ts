import { env } from './config/env.js';
import { emailDeliveriesRepository } from './features/email-deliveries/email-deliveries.repository.js';
import { createDeadEmailHandler, createSendEmailHandler } from './jobs/email.jobs.js';
import { selectEmailSender } from './infrastructure/email/selectEmailSender.js';
import {
  createPgBoss,
  deadLetterOf,
  queueConnectionString,
  registerHandler,
  startQueue,
} from './infrastructure/queue/pgBossQueue.js';
import { errorReporter, setErrorReporter } from './lib/errorReporting.js';
import { logger } from './lib/logger.js';
import { selectErrorReporter } from './infrastructure/monitoring/selectErrorReporter.js';

setErrorReporter(selectErrorReporter(env, 'worker'));

const SHUTDOWN_TIMEOUT_MS = 75_000;
const EMAIL_CONCURRENCY = 2;
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
