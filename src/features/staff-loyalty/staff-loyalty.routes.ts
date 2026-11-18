import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { createStaffLoyaltyController } from './staff-loyalty.controller.js';
import { adjustmentBody, customerParams, loyaltySettingsBody } from './staff-loyalty.schemas.js';
import type { StaffLoyaltyService } from './staff-loyalty.service.js';

/**
 * Fidélité côté équipe, sous /api/v1/staff : corrections de points d'un client et réglages de la fidélité.
 * Réservé à l'administrateur principal (vérifié par le service).
 */
export const createStaffLoyaltyRoutes = (
  service: StaffLoyaltyService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffLoyaltyController(service);
  const staffOnly = requireStaff(authenticator, now);
  const router = Router();
  router.post(
    '/customers/:customerId/loyalty-adjustments',
    staffOnly,
    validate({ params: customerParams, body: adjustmentBody }),
    asyncHandler(c.adjust),
  );
  router.get('/settings/loyalty', staffOnly, asyncHandler(c.settings));
  router.patch('/settings/loyalty', staffOnly, validate({ body: loyaltySettingsBody }), asyncHandler(c.updateSettings));
  return router;
};
