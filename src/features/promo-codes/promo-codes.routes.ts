import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { createPublicPromoCodesController } from './promo-codes.controller.js';
import type { PublicPromoCodesService } from './promo-codes.service.js';

/** Codes promotionnels ouverts à tous, sous /api/v1/promo-codes. */
export const createPublicPromoCodesRoutes = (service: PublicPromoCodesService) => {
  const c = createPublicPromoCodesController(service);
  const router = Router();
  router.get('/', asyncHandler(c.list));
  return router;
};
