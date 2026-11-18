import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { createLoyaltyController } from './loyalty.controller.js';
import { movementsQuery } from './loyalty.schemas.js';
import type { LoyaltyService } from './loyalty.service.js';

/** Fidélité du client connecté, sous /api/v1/loyalty : solde, niveau, progression, historique. */
export const createLoyaltyRoutes = (service: LoyaltyService, now: () => Date) => {
  const c = createLoyaltyController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.get('/', asyncHandler(c.summary));
  router.get('/movements', validate({ query: movementsQuery }), asyncHandler(c.movements));
  return router;
};
