import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { createHealthController } from './health.controller.js';
import type { HealthService } from './health.service.js';

/** Sondes de supervision, hors version de l'API : /health (vie) et /ready (disponibilité). */
export const createHealthRoutes = (service: HealthService) => {
  const controller = createHealthController(service);
  const router = Router();
  router.get('/health', controller.live);
  router.get('/ready', asyncHandler(controller.ready));
  return router;
};
