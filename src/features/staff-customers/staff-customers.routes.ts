import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffCustomersController } from './staff-customers.controller.js';
import { listCustomersQuery } from './staff-customers.schemas.js';
import type { StaffCustomersService } from './staff-customers.service.js';

/** Fichier clients de l'équipe, sous /api/v1/staff/customers (la correction de points est dans staff-loyalty). */
export const createStaffCustomersRoutes = (
  service: StaffCustomersService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffCustomersController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', validate({ query: listCustomersQuery }), asyncHandler(c.list));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  return router;
};
