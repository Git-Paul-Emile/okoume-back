import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { createStaffActivityController } from './staff-activity.controller.js';
import { exportBody, listActivityQuery } from './staff-activity.schemas.js';
import type { StaffActivityService } from './staff-activity.service.js';

/** Lecture du journal, sous /api/v1/staff/activity : réservé à l'administrateur principal. */
export const createStaffActivityRoutes = (
  service: StaffActivityService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffActivityController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', validate({ query: listActivityQuery }), asyncHandler(c.list));
  return router;
};

/** Déclaration d'un export, sous /api/v1/staff/exports : droit exports:exporter vérifié par le service. */
export const createStaffExportsRoutes = (
  service: StaffActivityService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffActivityController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.post('/', validate({ body: exportBody }), asyncHandler(c.recordExport));
  return router;
};
