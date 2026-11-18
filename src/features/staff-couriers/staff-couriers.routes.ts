import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffCouriersController } from './staff-couriers.controller.js';
import { createCourierBody, listCouriersQuery, updateCourierBody } from './staff-couriers.schemas.js';
import type { StaffCouriersService } from './staff-couriers.service.js';

/** Répertoire des livreurs, sous /api/v1/staff/couriers ; droits vérifiés par le service. */
export const createStaffCouriersRoutes = (
  service: StaffCouriersService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffCouriersController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', validate({ query: listCouriersQuery }), asyncHandler(c.list));
  router.post('/', validate({ body: createCourierBody }), asyncHandler(c.create));
  router.patch('/:id', validate({ params: idParam, body: updateCourierBody }), asyncHandler(c.update));
  return router;
};
