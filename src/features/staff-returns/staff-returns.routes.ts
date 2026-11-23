import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffReturnsController } from './staff-returns.controller.js';
import { listStaffReturnsQuery, returnDecisionBody } from './staff-returns.schemas.js';
import type { StaffReturnsService } from './staff-returns.service.js';

/**
 * Dossiers de retour, sous /api/v1/staff/returns : décision, réception et remboursement simple.
 */
export const createStaffReturnsRoutes = (
  service: StaffReturnsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffReturnsController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', validate({ query: listStaffReturnsQuery }), asyncHandler(c.list));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  router.post('/:id/decision', validate({ params: idParam, body: returnDecisionBody }), asyncHandler(c.decide));
  router.post('/:id/reception', validate({ params: idParam }), asyncHandler(c.receive));
  return router;
};
