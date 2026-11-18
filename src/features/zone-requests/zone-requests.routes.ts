import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { createAuthLimiter } from '../../core/middlewares/rateLimiters.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createZoneRequestsController } from './zone-requests.controller.js';
import { decideZoneRequestBody, zoneRequestBody } from './zone-requests.schemas.js';
import type { ZoneRequestsService } from './zone-requests.service.js';

/** Demande publique, sous /api/v1/zone-requests : limite stricte contre les envois en masse. */
export const createZoneRequestsRoutes = (service: ZoneRequestsService) => {
  const c = createZoneRequestsController(service);
  const router = Router();
  router.post('/', createAuthLimiter(), validate({ body: zoneRequestBody }), asyncHandler(c.create));
  return router;
};

/** Suivi par l'équipe, sous /api/v1/staff/zone-requests. */
export const createStaffZoneRequestsRoutes = (
  service: ZoneRequestsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createZoneRequestsController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', asyncHandler(c.list));
  router.patch('/:id', validate({ params: idParam, body: decideZoneRequestBody }), asyncHandler(c.decide));
  return router;
};
