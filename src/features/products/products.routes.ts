import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { validate } from '../../core/middlewares/validate.js';
import { createProductsController } from './products.controller.js';
import { listProductsQuery, productSlugParams } from './products.schemas.js';
import type { ProductsService } from './products.service.js';

/** Catalogue public, sous /api/v1/products. */
export const createProductsRoutes = (service: ProductsService) => {
  const c = createProductsController(service);
  const router = Router();
  router.get('/', validate({ query: listProductsQuery }), asyncHandler(c.list));
  router.get('/:slug', validate({ params: productSlugParams }), asyncHandler(c.get));
  return router;
};
