import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffAlertsController } from './staff-alerts.controller.js';
import { updateAlertBody } from './staff-alerts.schemas.js';
import type { StaffAlertsService } from './staff-alerts.service.js';

/** Dossiers d'alerte, sous /api/v1/staff/alerts. La détection tourne dans le worker, pas ici. */
export const createStaffAlertsRoutes = (
  service: StaffAlertsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffAlertsController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', asyncHandler(c.list));
  router.patch('/:id', validate({ params: idParam, body: updateAlertBody }), asyncHandler(c.update));
  return router;
};
