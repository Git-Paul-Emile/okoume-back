import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { createCategoriesController } from './categories.controller.js';
import type { CategoriesService } from './categories.service.js';

/** Arborescence publique des catégories et collections, sous /api/v1/categories. */
export const createCategoriesRoutes = (service: CategoriesService) => {
  const c = createCategoriesController(service);
  const router = Router();
  router.get('/', asyncHandler(c.list));
  return router;
};
