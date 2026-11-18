import { pino } from 'pino';
import { env } from '../config/env.js';
import { errorReporter } from './errorReporting.js';

const ERROR_LEVEL = 50;
const FATAL_LEVEL = 60;

/** Identifiant de requête porté par un logger de requête (pino-http), s'il y en a un. */
function requestIdOf(bindings: Record<string, unknown>): string | undefined {
  const req = bindings.req as { id?: unknown } | undefined;
  if (typeof req?.id === 'string') return req.id;
  return typeof bindings.reqId === 'string' ? bindings.reqId : undefined;
}

/**
 * Logger structuré JSON. Les champs sensibles sont masqués même s'ils sont passés par erreur.
 * En développement, `npm run dev | npx pino-pretty` rend la sortie lisible.
 * Chaque log error ou fatal qui porte une erreur (`err`) part aussi vers l'outil de supervision.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'okoume-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.refreshToken',
      '*.code',
    ],
    censor: '[masqué]',
  },
  hooks: {
    logMethod(args, method, level) {
      const [first, second] = args as unknown[];
      // pino-http journalise toute réponse 5xx avec une erreur fabriquée (« failed with status code ») : ce n'est
      // qu'un relevé, la vraie cause est journalisée à part par le gestionnaire d'erreurs. Pas de doublon dans Sentry.
      const synthetic = second === 'request errored';
      if (!synthetic && level >= ERROR_LEVEL && typeof first === 'object' && first !== null && 'err' in first) {
        errorReporter().capture((first as { err: unknown }).err, {
          level: level >= FATAL_LEVEL ? 'fatal' : 'error',
          message: typeof second === 'string' ? second : undefined,
          requestId: requestIdOf(this.bindings()),
        });
      }
      return method.apply(this, args);
    },
  },
});
