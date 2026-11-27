import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { createShopsController } from './shops.controller.js';
import { openShopBody, pageQuery, slugParam, updateShopBody } from './shops.schemas.js';
import type { ShopsService } from './shops.service.js';

export const createPublicShopsRoutes = (service: ShopsService) => {
  const c = createShopsController(service);
  const router = Router();
  router.get('/', validate({ query: pageQuery }), asyncHandler(c.publicList));
  router.get('/:slug', validate({ params: slugParam }), asyncHandler(c.publicShop));
  return router;
};

export const createSellerShopRoutes = (service: ShopsService, now: () => Date) => {
  const c = createShopsController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.post('/', validate({ body: openShopBody }), asyncHandler(c.open));
  router.get('/', asyncHandler(c.mine));
  router.patch('/', validate({ body: updateShopBody }), asyncHandler(c.update));
  return router;
};
