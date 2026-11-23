import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { createShopsController } from './shops.controller.js';
import {
  changePlanBody,
  declarePaymentBody,
  openShopBody,
  pageQuery,
  slugParam,
  updateShopBody,
} from './shops.schemas.js';
import type { ShopsService } from './shops.service.js';

/** Offres d'accès proposées aux vendeurs, sous /api/v1/access-plans (public). */
export const createAccessPlansRoutes = (service: ShopsService) => {
  const c = createShopsController(service);
  const router = Router();
  router.get('/', asyncHandler(c.plans));
  return router;
};

/** Fiche publique d'une boutique, sous /api/v1/shops. */
export const createPublicShopsRoutes = (service: ShopsService) => {
  const c = createShopsController(service);
  const router = Router();
  router.get('/', validate({ query: pageQuery }), asyncHandler(c.publicList));
  router.get('/:slug', validate({ params: slugParam }), asyncHandler(c.publicShop));
  return router;
};

/**
 * Boutique du client connecté, sous /api/v1/seller/shop. Aucun identifiant dans l'URL : la boutique est
 * celle du compte connecté, ce qui exclut l'accès à la boutique d'un autre (IDOR).
 */
export const createSellerShopRoutes = (service: ShopsService, now: () => Date) => {
  const c = createShopsController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.post('/', validate({ body: openShopBody }), asyncHandler(c.open));
  router.get('/', asyncHandler(c.mine));
  router.patch('/', validate({ body: updateShopBody }), asyncHandler(c.update));
  router.put('/plan', validate({ body: changePlanBody }), asyncHandler(c.changePlan));
  router.post('/payments', validate({ body: declarePaymentBody }), asyncHandler(c.declarePayment));
  router.get('/payments', validate({ query: pageQuery }), asyncHandler(c.payments));
  return router;
};
