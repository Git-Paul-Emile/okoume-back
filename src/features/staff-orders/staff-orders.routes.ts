import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requirePermission, requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffOrdersController } from './staff-orders.controller.js';
import {
  cancellationDecisionBody,
  deliveryCostBody,
  reviewClearanceBody,
  disputeResolutionBody,
  listStaffOrdersQuery,
  transitionBody,
} from './staff-orders.schemas.js';
import type { StaffOrdersService } from './staff-orders.service.js';

/**
 * Commandes côté équipe, sous /api/v1/staff/orders. Lecture : commandes:consulter. Le droit propre à chaque
 * transition (modifier, annuler, valider) est vérifié par le service selon l'action demandée.
 */
export const createStaffOrdersRoutes = (
  service: StaffOrdersService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffOrdersController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now), requirePermission('commandes:consulter'));
  router.get('/', validate({ query: listStaffOrdersQuery }), asyncHandler(c.list));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  router.post('/:id/transitions', validate({ params: idParam, body: transitionBody }), asyncHandler(c.transition));
  router.post(
    '/:id/review-clearances',
    validate({ params: idParam, body: reviewClearanceBody }),
    asyncHandler(c.clearReview),
  );
  router.put(
    '/:id/delivery-cost',
    validate({ params: idParam, body: deliveryCostBody }),
    asyncHandler(c.setDeliveryCost),
  );
  router.patch(
    '/:id/delivery-dispute',
    validate({ params: idParam, body: disputeResolutionBody }),
    asyncHandler(c.resolveDispute),
  );
  router.patch(
    '/:id/cancellation-request',
    validate({ params: idParam, body: cancellationDecisionBody }),
    asyncHandler(c.decideCancellation),
  );
  return router;
};
