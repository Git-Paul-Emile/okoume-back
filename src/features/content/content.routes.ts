import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createContentController } from './content.controller.js';
import {
  createAdBody,
  legalPageBody,
  legalSlugParam,
  listAdsQuery,
  updateAdBody,
  updateBannerBody,
} from './content.schemas.js';
import type { ContentService } from './content.service.js';

/** Contenus publics, sous /api/v1/content. */
export const createContentRoutes = (service: ContentService) => {
  const c = createContentController(service);
  const router = Router();
  router.get('/banners', asyncHandler(c.banners));
  router.get('/ads', validate({ query: listAdsQuery }), asyncHandler(c.ads));
  router.get('/offers', asyncHandler(c.offers));
  router.get('/legal-pages', asyncHandler(c.legalPages));
  return router;
};

/** Gestion des contenus par l'équipe, sous /api/v1/staff/content. */
export const createStaffContentRoutes = (
  service: ContentService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createContentController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/banners', asyncHandler(c.staffBanners));
  router.patch('/banners/:id', validate({ params: idParam, body: updateBannerBody }), asyncHandler(c.updateBanner));
  router.get('/ads', asyncHandler(c.staffAds));
  router.post('/ads', validate({ body: createAdBody }), asyncHandler(c.createAd));
  router.patch('/ads/:id', validate({ params: idParam, body: updateAdBody }), asyncHandler(c.updateAd));
  router.get('/legal-pages', asyncHandler(c.staffLegalPages));
  router.put(
    '/legal-pages/:slug',
    validate({ params: legalSlugParam, body: legalPageBody }),
    asyncHandler(c.saveLegalPage),
  );
  return router;
};
