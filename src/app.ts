import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './core/middlewares/errorHandler.js';
import { notFound } from './core/middlewares/notFound.js';
import { csrfProtection } from './core/middlewares/csrf.js';
import { createApiLimiter, createStaffLimiter } from './core/middlewares/rateLimiters.js';
import { requestLogger } from './core/middlewares/requestLogger.js';
import { createHealthRoutes } from './features/health/health.routes.js';
import type { HealthService } from './features/health/health.service.js';
import { createApiRoutes, type ApiServices } from './routes.js';

const JSON_LIMIT = '100kb';

export interface AppDependencies extends ApiServices {
  health: HealthService;
}

/**
 * Application Express, dans l'ordre imposé par rules/10-stack/backend.md : sécurité, parsing,
 * limitation de débit, journalisation, routes (authentification et validation par route), erreurs.
 * Les dépendances sont fournies par src/composition.ts, ou par les tests.
 */
export function createApp(dependencies: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  // Derrière le proxy de l'hébergeur : l'adresse IP réelle sert à la limitation de débit
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: JSON_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: JSON_LIMIT }));
  app.use(cookieParser());
  app.use(requestLogger);

  app.use(createHealthRoutes(dependencies.health));
  app.use('/api/v1', createApiLimiter(), createStaffLimiter(), csrfProtection, createApiRoutes(dependencies));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
