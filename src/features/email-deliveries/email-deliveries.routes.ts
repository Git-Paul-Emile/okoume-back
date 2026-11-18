import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { createEmailDeliveriesController } from './email-deliveries.controller.js';
import { deliveryParam, listDeliveriesQuery } from './email-deliveries.schemas.js';
import type { EmailDeliveriesService } from './email-deliveries.service.js';

/** Suivi des e-mails, sous /api/v1/staff/emails. */
export const createEmailDeliveriesRoutes = (
  service: EmailDeliveriesService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createEmailDeliveriesController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', validate({ query: listDeliveriesQuery }), asyncHandler(c.list));
  router.post('/:id/retries', validate({ params: deliveryParam }), asyncHandler(c.retry));
  return router;
};
