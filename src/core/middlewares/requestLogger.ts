import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../../lib/logger.js';

/** Identifiant de corrélation accepté depuis le front s'il est bien formé, sinon généré. */
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Journalise chaque requête HTTP (méthode, route, statut, durée) avec son identifiant de corrélation,
 * renvoyé au client dans l'en-tête X-Request-Id. Le corps de la requête n'est jamais journalisé.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel: (_req, res, error) =>
    error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
  serializers: {
    req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});
