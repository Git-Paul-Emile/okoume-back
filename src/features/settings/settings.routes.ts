import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { createSettingsController } from './settings.controller.js';
import { updateInformationBody } from './settings.schemas.js';
import type { SettingsService } from './settings.service.js';

/** Réglages publics de la boutique, sous /api/v1/settings : paiement, contacts, fidélité, délais. */
export const createPublicSettingsRoutes = (service: SettingsService) => {
  const c = createSettingsController(service);
  const router = Router();
  router.get('/', asyncHandler(c.publicSettings));
  return router;
};

/** Informations et réglages d'exploitation, sous /api/v1/staff/settings/shop ; administrateur principal. */
export const createStaffSettingsRoutes = (
  service: SettingsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createSettingsController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', asyncHandler(c.information));
  router.patch('/', validate({ body: updateInformationBody }), asyncHandler(c.updateInformation));
  return router;
};
