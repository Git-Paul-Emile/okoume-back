import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createSellerOrdersController } from './seller-orders.controller.js';
import {
  advanceSellerOrderBody,
  cancelSellerOrderBody,
  collectSellerOrderBody,
  handoverSellerOrderBody,
  listSellerOrdersQuery,
} from './seller-orders.schemas.js';
import type { SellerOrdersService } from './seller-orders.service.js';

/** Commandes reçues par la boutique du compte connecté, sous /api/v1/seller/orders (32.4 à 32.6). */
export const createSellerOrdersRoutes = (service: SellerOrdersService, now: () => Date) => {
  const c = createSellerOrdersController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.get('/', validate({ query: listSellerOrdersQuery }), asyncHandler(c.list));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  router.post('/:id/progress', validate({ params: idParam, body: advanceSellerOrderBody }), asyncHandler(c.advance));
  router.post('/:id/handover', validate({ params: idParam, body: handoverSellerOrderBody }), asyncHandler(c.handover));
  router.post('/:id/cancellation', validate({ params: idParam, body: cancelSellerOrderBody }), asyncHandler(c.cancel));
  router.post('/:id/collection', validate({ params: idParam, body: collectSellerOrderBody }), asyncHandler(c.collect));
  return router;
};
