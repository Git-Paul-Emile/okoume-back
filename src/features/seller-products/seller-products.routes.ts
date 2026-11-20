import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createSellerProductsController } from './seller-products.controller.js';
import {
  addSellerVariantBody,
  createSellerProductBody,
  listSellerProductsQuery,
  sellerStockBody,
  sellerVariantParams,
  updateSellerProductBody,
  updateSellerVariantBody,
} from './seller-products.schemas.js';
import type { SellerProductsService } from './seller-products.service.js';

/** Produits de la boutique du compte connecté, sous /api/v1/seller/products (32.3, 32.8). */
export const createSellerProductsRoutes = (service: SellerProductsService, now: () => Date) => {
  const c = createSellerProductsController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.get('/', validate({ query: listSellerProductsQuery }), asyncHandler(c.list));
  router.post('/', validate({ body: createSellerProductBody }), asyncHandler(c.create));
  router.post('/photo-uploads', asyncHandler(c.signPhotoUpload));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  router.patch('/:id', validate({ params: idParam, body: updateSellerProductBody }), asyncHandler(c.update));
  router.post('/:id/submission', validate({ params: idParam }), asyncHandler(c.submit));
  router.post('/:id/withdrawal', validate({ params: idParam }), asyncHandler(c.withdraw));
  router.post('/:id/variants', validate({ params: idParam, body: addSellerVariantBody }), asyncHandler(c.addVariant));
  router.patch(
    '/:id/variants/:variantId',
    validate({ params: sellerVariantParams, body: updateSellerVariantBody }),
    asyncHandler(c.updateVariant),
  );
  router.put(
    '/:id/variants/:variantId/stock',
    validate({ params: sellerVariantParams, body: sellerStockBody }),
    asyncHandler(c.setStock),
  );
  return router;
};
