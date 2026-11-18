import { PgBoss, type Queue } from 'pg-boss';
import pg from 'pg';
import { logger } from '../../lib/logger.js';
import type { JobQueue } from './jobQueue.js';
import type { JobName, JobPayloads, QueuedJob } from './jobs.js';

/** File des échecs définitifs d'une file : les jobs y arrivent quand toutes les reprises ont échoué. */
export const deadLetterOf = <N extends JobName>(name: N) => `${name}.dead` as const;

/** Réglages d'une file, tous modifiables après création : le code reste la référence. */
type QueueSettings = Pick<
  Queue,
  | 'retryLimit'
  | 'retryDelay'
  | 'retryBackoff'
  | 'retryDelayMax'
  | 'expireInSeconds'
  | 'deleteAfterSeconds'
  | 'retentionSeconds'
  | 'warningQueueSize'
  | 'deadLetter'
>;

const HOUR = 3_600;
const DAY = 24 * HOUR;

/**
 * Réglages de chaque file (rules/10-stack/async.md) : reprises avec backoff exponentiel plafonné,
 * délai maximal d'exécution, conservation courte des jobs terminés.
 * Les e-mails contiennent des codes de vérification : un job réussi est supprimé au bout d'une heure.
 */
const QUEUES: Record<JobName, Omit<QueueSettings, 'deadLetter'>> = {
  'email.send': {
    retryLimit: 6,
    retryDelay: 30,
    retryBackoff: true,
    retryDelayMax: 30 * 60,
    expireInSeconds: 60,
    deleteAfterSeconds: HOUR,
    retentionSeconds: DAY,
    warningQueueSize: 500,
  },
  // Une notification vieillit vite : reprises rapprochées, abandon au bout d'une heure environ
  'push.send': {
    retryLimit: 4,
    retryDelay: 60,
    retryBackoff: true,
    retryDelayMax: 15 * 60,
    expireInSeconds: 60,
    deleteAfterSeconds: HOUR,
    retentionSeconds: HOUR,
    warningQueueSize: 1_000,
  },
  // Rejouable sans doublon (une récompense par client et par an) : quelques reprises suffisent
  // Une réponse de tchat attendue en quelques secondes : reprises rapprochées, puis le vendeur prend le relais
  'chat.reply': {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    retryDelayMax: 60,
    expireInSeconds: 90,
    deleteAfterSeconds: DAY,
    retentionSeconds: HOUR,
  },
  // Avis gardé par version : rejouable sans effet en double. Après les reprises, l'annonce passe en modération humaine
  'listings.review': {
    retryLimit: 4,
    retryDelay: 30,
    retryBackoff: true,
    retryDelayMax: 10 * 60,
    expireInSeconds: 150,
    deleteAfterSeconds: DAY,
    retentionSeconds: DAY,
  },
  // Rejouable sans doublon (un rappel par échéance) : quelques reprises suffisent
  'shops.access-reminders': {
    retryLimit: 3,
    retryDelay: 300,
    retryBackoff: true,
    expireInSeconds: 15 * 60,
    deleteAfterSeconds: 7 * DAY,
    retentionSeconds: DAY,
  },
  // Rejouable sans doublon (un compte anonymisé n'est plus sélectionné) : quelques reprises suffisent
  // Rejouable (mise à jour des dossiers, jamais de doublon) ; un passage manqué est rattrapé par le suivant
  // Rejouable : une suppression déjà faite ne trouve plus rien
  'analytics.purge': {
    retryLimit: 3,
    retryDelay: 300,
    retryBackoff: true,
    expireInSeconds: 15 * 60,
    deleteAfterSeconds: 7 * DAY,
    retentionSeconds: DAY,
  },
  'alerts.detect': {
    retryLimit: 1,
    retryDelay: 60,
    expireInSeconds: 5 * 60,
    deleteAfterSeconds: DAY,
    retentionSeconds: HOUR,
  },
  'privacy.inactive-accounts': {
    retryLimit: 3,
    retryDelay: 300,
    retryBackoff: true,
    expireInSeconds: 15 * 60,
    deleteAfterSeconds: 7 * DAY,
    retentionSeconds: DAY,
  },
  'loyalty.birthdays': {
    retryLimit: 3,
    retryDelay: 300,
    retryBackoff: true,
    expireInSeconds: 15 * 60,
    deleteAfterSeconds: 7 * DAY,
    retentionSeconds: DAY,
  },
};

/** Fuseau de la boutique : les traitements planifiés suivent l'heure de Libreville. */
const SHOP_TIME_ZONE = 'Africa/Libreville';

/**
 * Planification quotidienne d'un job (expression cron, heure de Libreville). Après un arrêt, une seule
 * exécution rattrape les échéances manquées.
 */
export async function scheduleDaily<N extends JobName>(boss: PgBoss, name: N, cron: string, data: JobPayloads[N]) {
  await boss.schedule(name, cron, data, { tz: SHOP_TIME_ZONE, missed: 'once' });
}

/** Les échecs définitifs sont gardés 7 jours pour analyse, sans reprise automatique. */
const DEAD_LETTER: QueueSettings = { retryLimit: 0, deleteAfterSeconds: 7 * DAY, retentionSeconds: 7 * DAY };

/**
 * Instance pg-boss sur la connexion directe (sans pooler Neon) : la file tient des verrous et des
 * connexions longues qu'un pooler en mode transaction ne garantit pas. Les tables sont créées par
 * pg-boss dans son propre schéma, à part des tables métier gérées par Prisma.
 */
export function createPgBoss(connectionString: string, role: 'api' | 'worker') {
  const boss = new PgBoss({
    connectionString,
    application_name: `okoume-${role}`,
    // Seul le worker surveille les files et déclenche les tâches planifiées
    supervise: role === 'worker',
    schedule: role === 'worker',
  });
  boss.on('error', (err) => logger.error({ err }, 'Erreur de la file de traitements'));
  boss.on('warning', (warning) => logger.warn({ warning: warning.message }, 'Alerte de la file de traitements'));
  return boss;
}

/** Crée chaque file et sa file d'échecs, ou aligne leur réglage sur le code s'il a changé. */
export async function ensureQueues(boss: PgBoss) {
  for (const [name, options] of Object.entries(QUEUES) as Array<[JobName, (typeof QUEUES)[JobName]]>) {
    await upsertQueue(boss, deadLetterOf(name), DEAD_LETTER);
    await upsertQueue(boss, name, { ...options, deadLetter: deadLetterOf(name) });
  }
}

async function upsertQueue(boss: PgBoss, name: string, settings: QueueSettings) {
  if (await boss.getQueue(name)) return boss.updateQueue(name, settings);
  return boss.createQueue(name, settings);
}

export const createPgBossJobQueue = (boss: PgBoss): JobQueue => ({
  async send(name, data) {
    await boss.send(name, data);
  },
});

/** Branche un gestionnaire sur une file (ou sa file d'échecs). Une erreur levée déclenche la reprise. */
export async function registerHandler<N extends JobName>(
  boss: PgBoss,
  queue: N | `${N}.dead`,
  handler: (jobs: Array<QueuedJob<N>>) => Promise<void>,
  concurrency = 1,
) {
  await boss.work<JobPayloads[N]>(queue, { localConcurrency: concurrency }, handler);
}

/** Connexion de la file : la connexion directe si elle existe (Neon), sinon la connexion de l'application. */
export const queueConnectionString = (config: { DATABASE_URL: string; DIRECT_DATABASE_URL?: string | undefined }) =>
  config.DIRECT_DATABASE_URL ?? config.DATABASE_URL;

/** Clé du verrou de préparation de la file, propre à l'application */
const QUEUE_SETUP_LOCK = 4_207_311;

/**
 * Démarre la file et crée ou aligne ses files. L'API et le worker démarrent souvent en même temps (déploiement) :
 * sur une base neuve, tous deux créeraient le schéma de pg-boss et l'un échouerait (« type job_state existe
 * déjà »). Un verrou PostgreSQL les fait passer l'un après l'autre ; le second trouve tout en place.
 */
export async function startQueue(boss: PgBoss, connectionString: string) {
  const lock = new pg.Client({ connectionString, application_name: 'okoume-queue-setup' });
  await lock.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [QUEUE_SETUP_LOCK]);
    await boss.start();
    await ensureQueues(boss);
  } finally {
    // La fermeture de la connexion libère aussi le verrou si le déverrouillage échoue
    await lock.query('SELECT pg_advisory_unlock($1)', [QUEUE_SETUP_LOCK]).catch(() => undefined);
    await lock.end();
  }
}
