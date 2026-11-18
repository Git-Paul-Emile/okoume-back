import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffPromoCodesController } from './staff-promo-codes.controller.js';
import { createPromoCodeBody, listPromoCodesQuery, updatePromoCodeBody } from './staff-promo-codes.schemas.js';
import type { StaffPromoCodesService } from './staff-promo-codes.service.js';

/** Codes promotionnels côté équipe, sous /api/v1/staff/promo-codes ; droits vérifiés par le service. */
export const createStaffPromoCodesRoutes = (
  service: StaffPromoCodesService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffPromoCodesController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', validate({ query: listPromoCodesQuery }), asyncHandler(c.list));
  router.post('/', validate({ body: createPromoCodeBody }), asyncHandler(c.create));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  router.patch('/:id', validate({ params: idParam, body: updatePromoCodeBody }), asyncHandler(c.update));
  return router;
};
