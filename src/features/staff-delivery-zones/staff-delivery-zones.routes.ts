import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requirePermission, requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffZonesController } from './staff-delivery-zones.controller.js';
import { createZoneBody, updateZoneBody } from './staff-delivery-zones.schemas.js';
import type { StaffZonesService } from './staff-delivery-zones.service.js';

/** Zones de livraison côté équipe, sous /api/v1/staff/delivery-zones ; écriture : commandes:modifier. */
export const createStaffZonesRoutes = (
  service: StaffZonesService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffZonesController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now), requirePermission('commandes:consulter'));
  router.get('/', asyncHandler(c.list));
  router.post('/', validate({ body: createZoneBody }), asyncHandler(c.create));
  router.patch('/:id', validate({ params: idParam, body: updateZoneBody }), asyncHandler(c.update));
  return router;
};
