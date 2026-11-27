import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffShopsController } from './staff-shops.controller.js';
import { listShopsQuery, shopActionBody } from './staff-shops.schemas.js';
import type { StaffShopsService } from './staff-shops.service.js';

export const createStaffMarketplaceRoutes = (
  service: StaffShopsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffShopsController(service);
  const shops = Router();
  shops.use(requireStaff(authenticator, now));
  shops.get('/', validate({ query: listShopsQuery }), asyncHandler(c.list));
  shops.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  shops.patch('/:id', validate({ params: idParam, body: shopActionBody }), asyncHandler(c.act));
  return { shops };
};
