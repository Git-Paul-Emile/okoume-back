import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffPaymentsController } from './staff-payments.controller.js';
import type { StaffPaymentsService } from './staff-payments.service.js';

/**
 * Paiements d'une commande, sous /api/v1/staff/orders/:id/payments. Montées à côté des routes
 * des commandes : la session est exigée route par route, pour ne pas s'appliquer aux autres chemins
 * /staff/orders. Le service vérifie le droit paiements:consulter.
 */
export const createStaffPaymentsRoutes = (
  service: StaffPaymentsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffPaymentsController(service);
  const staffOnly = requireStaff(authenticator, now);
  const router = Router();
  router.get('/:id/payments', staffOnly, validate({ params: idParam }), asyncHandler(c.get));
  return router;
};
