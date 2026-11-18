import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createListingRequestsController } from './listing-requests.controller.js';
import { buyerActionBody, createRequestBody, listRequestsQuery, sellerActionBody } from './listing-requests.schemas.js';
import type { ListingRequestsService } from './listing-requests.service.js';

/** Demandes de l'acheteur connecté, sous /api/v1/listing-requests ; les visiteurs doivent se connecter (32.6). */
export const createBuyerRequestsRoutes = (service: ListingRequestsService, now: () => Date) => {
  const c = createListingRequestsController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.post('/', validate({ body: createRequestBody }), asyncHandler(c.create));
  router.get('/', validate({ query: listRequestsQuery }), asyncHandler(c.buyerList));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.buyerGet));
  router.patch('/:id', validate({ params: idParam, body: buyerActionBody }), asyncHandler(c.cancel));
  return router;
};

/** Demandes reçues par la boutique du vendeur connecté, sous /api/v1/seller/listing-requests. */
export const createSellerRequestsRoutes = (service: ListingRequestsService, now: () => Date) => {
  const c = createListingRequestsController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.get('/', validate({ query: listRequestsQuery }), asyncHandler(c.sellerList));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.sellerGet));
  router.patch('/:id', validate({ params: idParam, body: sellerActionBody }), asyncHandler(c.sellerAct));
  return router;
};
