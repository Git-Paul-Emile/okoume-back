import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffShopsController } from './staff-shops.controller.js';
import {
  createPlanBody,
  listShopPaymentsQuery,
  listShopsQuery,
  marketplaceSettingsBody,
  paymentDecisionBody,
  shopActionBody,
  updatePlanBody,
} from './staff-shops.schemas.js';
import type { StaffShopsService } from './staff-shops.service.js';

/**
 * Administration de la place de marché ; droits vendeurs:* vérifiés par le service. Routeurs à monter sous
 * /staff/access-plans, /staff/shops, /staff/shop-payments et /staff/settings/marketplace.
 */
export const createStaffMarketplaceRoutes = (
  service: StaffShopsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffShopsController(service);
  const staffOnly = requireStaff(authenticator, now);

  const plans = Router();
  plans.use(staffOnly);
  plans.get('/', asyncHandler(c.plans));
  plans.post('/', validate({ body: createPlanBody }), asyncHandler(c.createPlan));
  plans.patch('/:id', validate({ params: idParam, body: updatePlanBody }), asyncHandler(c.updatePlan));

  const shops = Router();
  shops.use(staffOnly);
  shops.get('/', validate({ query: listShopsQuery }), asyncHandler(c.list));
  shops.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  shops.patch('/:id', validate({ params: idParam, body: shopActionBody }), asyncHandler(c.act));

  const payments = Router();
  payments.use(staffOnly);
  payments.get('/', validate({ query: listShopPaymentsQuery }), asyncHandler(c.payments));
  payments.patch('/:id', validate({ params: idParam, body: paymentDecisionBody }), asyncHandler(c.decidePayment));

  const settings = Router();
  settings.use(staffOnly);
  settings.get('/', asyncHandler(c.settings));
  settings.patch('/', validate({ body: marketplaceSettingsBody }), asyncHandler(c.updateSettings));

  return { plans, shops, payments, settings };
};
