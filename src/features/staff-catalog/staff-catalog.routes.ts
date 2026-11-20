import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requirePermission, requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffCatalogController } from './staff-catalog.controller.js';
import {
  addVariantBody,
  createProductBody,
  listStaffProductsQuery,
  priceChangesQuery,
  moderationBody,
  productStatusBody,
  updateProductBody,
  updateVariantBody,
  variantRouteParams,
} from './staff-catalog.schemas.js';
import type { StaffCatalogService } from './staff-catalog.service.js';

/**
 * Produits côté équipe, sous /api/v1/staff/products. Lecture : catalogue:consulter. Création, modification
 * et publication : droit vérifié par le service (catalogue:creer, catalogue:modifier, catalogue:publier).
 */
export const createStaffCatalogRoutes = (
  service: StaffCatalogService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffCatalogController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now), requirePermission('catalogue:consulter'));
  router.get('/', validate({ query: listStaffProductsQuery }), asyncHandler(c.list));
  router.post('/', validate({ body: createProductBody }), asyncHandler(c.create));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  router.patch('/:id', validate({ params: idParam, body: updateProductBody }), asyncHandler(c.update));
  router.put('/:id/status', validate({ params: idParam, body: productStatusBody }), asyncHandler(c.setStatus));
  router.put('/:id/moderation', validate({ params: idParam, body: moderationBody }), asyncHandler(c.moderate));
  router.post('/:id/variants', validate({ params: idParam, body: addVariantBody }), asyncHandler(c.addVariant));
  router.patch(
    '/:id/variants/:variantId',
    validate({ params: variantRouteParams, body: updateVariantBody }),
    asyncHandler(c.updateVariant),
  );
  return router;
};

/** Historique des prix, sous /api/v1/staff/price-changes (catalogue:consulter). */
export const createStaffPriceChangesRoutes = (
  service: StaffCatalogService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffCatalogController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now), requirePermission('catalogue:consulter'));
  router.get('/', validate({ query: priceChangesQuery }), asyncHandler(c.priceChanges));
  return router;
};
