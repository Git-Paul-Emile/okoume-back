import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requirePermission, requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffCategoriesController } from './staff-categories.controller.js';
import { createCategoryBody, updateCategoryBody } from './staff-categories.schemas.js';
import type { StaffCategoriesService } from './staff-categories.service.js';

/** Catégories et collections côté équipe, sous /api/v1/staff/categories ; écriture : catalogue:modifier. */
export const createStaffCategoriesRoutes = (
  service: StaffCategoriesService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffCategoriesController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now), requirePermission('catalogue:consulter'));
  router.get('/', asyncHandler(c.list));
  router.post('/', validate({ body: createCategoryBody }), asyncHandler(c.create));
  router.patch('/:id', validate({ params: idParam, body: updateCategoryBody }), asyncHandler(c.update));
  router.delete('/:id', validate({ params: idParam }), asyncHandler(c.remove));
  return router;
};
