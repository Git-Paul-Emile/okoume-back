import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer, requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { createNotificationsController } from './notifications.controller.js';
import { prefsBody, subscriptionBody, unsubscribeBody } from './notifications.schemas.js';
import type { NotificationsService } from './notifications.service.js';

/** Clé publique et appareils du client, sous /api/v1/push. Le désabonnement passe l'adresse dans le corps, jamais dans l'URL. */
export const createCustomerPushRoutes = (service: NotificationsService, now: () => Date) => {
  const c = createNotificationsController(service);
  const customerOnly = requireCustomer(now);
  const router = Router();
  router.get('/public-key', asyncHandler(c.publicKey));
  router.post('/subscriptions', customerOnly, validate({ body: subscriptionBody }), asyncHandler(c.subscribe));
  router.delete('/subscriptions', customerOnly, validate({ body: unsubscribeBody }), asyncHandler(c.unsubscribe));
  return router;
};

/** Réglages de notification du client, sous /api/v1/notification-preferences. */
export const createPreferencesRoutes = (service: NotificationsService, now: () => Date) => {
  const c = createNotificationsController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.get('/', asyncHandler(c.preferences));
  router.patch('/', validate({ body: prefsBody }), asyncHandler(c.updatePreferences));
  return router;
};

/** Appareils de l'équipe, sous /api/v1/staff/push : chacun reçoit les alertes que ses droits autorisent. */
export const createStaffPushRoutes = (
  service: NotificationsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createNotificationsController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.post('/subscriptions', validate({ body: subscriptionBody }), asyncHandler(c.subscribe));
  router.delete('/subscriptions', validate({ body: unsubscribeBody }), asyncHandler(c.unsubscribe));
  return router;
};
