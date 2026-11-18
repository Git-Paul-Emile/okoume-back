import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createAccountController } from './account.controller.js';
import { createAddressBody, productIdParam, profileBody, updateAddressBody } from './account.schemas.js';
import type { AccountService } from './account.service.js';

/** Compte du client connecté, sous /api/v1/me : identité, adresses de livraison, favoris. */
export const createAccountRoutes = (service: AccountService, now: () => Date) => {
  const c = createAccountController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.patch('/', validate({ body: profileBody }), asyncHandler(c.updateProfile));
  router.get('/addresses', asyncHandler(c.addresses));
  router.post('/addresses', validate({ body: createAddressBody }), asyncHandler(c.addAddress));
  router.patch('/addresses/:id', validate({ params: idParam, body: updateAddressBody }), asyncHandler(c.updateAddress));
  router.delete('/addresses/:id', validate({ params: idParam }), asyncHandler(c.removeAddress));
  router.get('/favorites', asyncHandler(c.favorites));
  router.put('/favorites/:productId', validate({ params: productIdParam }), asyncHandler(c.addFavorite));
  router.delete('/favorites/:productId', validate({ params: productIdParam }), asyncHandler(c.removeFavorite));
  return router;
};
