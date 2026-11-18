import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { createAnalyticsController } from './analytics.controller.js';
import { eventBody, windowQuery } from './analytics.schemas.js';
import type { AnalyticsService } from './analytics.service.js';

/** Collecte publique, sous /api/v1 : événements d'audience et compteur de l'assistant client. */
export const createAnalyticsRoutes = (service: AnalyticsService) => {
  const c = createAnalyticsController(service);
  const router = Router();
  router.post('/analytics/events', validate({ body: eventBody }), asyncHandler(c.record));
  router.get('/assistant/usage', asyncHandler(c.assistantUsage));
  router.post('/assistant/usage', asyncHandler(c.consumeAssistant));
  return router;
};

/** Lecture par le pilotage, sous /api/v1/staff/analytics. */
export const createStaffAnalyticsRoutes = (
  service: AnalyticsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createAnalyticsController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/product-events', validate({ query: windowQuery }), asyncHandler(c.productEvents));
  router.get('/searches', validate({ query: windowQuery }), asyncHandler(c.searches));
  router.get('/daily', validate({ query: windowQuery }), asyncHandler(c.daily));
  return router;
};
