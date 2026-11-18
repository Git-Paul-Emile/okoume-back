import { createApp } from './app.js';
import { createDependencies } from './composition.js';
import { env } from './config/env.js';
import {
  createPgBoss,
  createPgBossJobQueue,
  startQueue,
  queueConnectionString,
} from './infrastructure/queue/pgBossQueue.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { selectErrorReporter } from './infrastructure/monitoring/selectErrorReporter.js';
import { errorReporter, setErrorReporter } from './lib/errorReporting.js';

// Supervision branchée avant tout : une erreur de démarrage est déjà remontée
setErrorReporter(selectErrorReporter(env, 'api'));

const SHUTDOWN_TIMEOUT_MS = 10_000;
// L'API ne fait que déposer des jobs : la file se ferme vite, dans le délai d'arrêt global
const QUEUE_STOP_TIMEOUT_MS = 5_000;

// La file doit être prête avant la première requête : un e-mail déposé ne doit jamais échouer faute de file
const boss = createPgBoss(queueConnectionString(env), 'api');
try {
  await startQueue(boss, queueConnectionString(env));
} catch (err) {
  logger.fatal({ err }, 'Démarrage impossible : la file de traitements ne répond pas');
  await errorReporter().flush(2_000);
  process.exit(1);
}

const server = createApp(createDependencies(createPgBossJobQueue(boss))).listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API démarrée');
});

/**
 * Arrêt propre : on cesse d'accepter des connexions, on termine les requêtes en cours,
 * puis on ferme la file et la base. Au-delà du délai, l'arrêt est forcé.
 */
function shutdown(signal: string) {
  logger.info({ signal }, 'Arrêt demandé');
  const force = setTimeout(() => {
    logger.error('Arrêt forcé après délai');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();
  server.close(async () => {
    await boss.stop({ graceful: true, timeout: QUEUE_STOP_TIMEOUT_MS });
    await prisma.$disconnect();
    await errorReporter().flush(2_000);
    logger.info('API arrêtée');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Promesse rejetée sans traitement');
  shutdown('unhandledRejection');
});
