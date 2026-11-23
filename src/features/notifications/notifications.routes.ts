import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { createNotificationsController } from './notifications.controller.js';
import { prefsBody } from './notifications.schemas.js';
import type { NotificationsService } from './notifications.service.js';

/** Réglages de notification du client, sous /api/v1/notification-preferences. */
export const createPreferencesRoutes = (service: NotificationsService, now: () => Date) => {
  const c = createNotificationsController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.get('/', asyncHandler(c.preferences));
  router.patch('/', validate({ body: prefsBody }), asyncHandler(c.updatePreferences));
  return router;
};
