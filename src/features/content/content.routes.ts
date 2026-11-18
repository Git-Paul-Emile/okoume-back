import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createContentController } from './content.controller.js';
import {
  articleBody,
  legalPageBody,
  legalSlugParam,
  listAdsQuery,
  slugParam,
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
  router.get('/articles', asyncHandler(c.articles));
  router.get('/articles/:slug', validate({ params: slugParam }), asyncHandler(c.article));
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
  router.patch('/ads/:id', validate({ params: idParam, body: updateAdBody }), asyncHandler(c.updateAd));
  router.get('/articles', asyncHandler(c.staffArticles));
  router.post('/articles', validate({ body: articleBody }), asyncHandler(c.createArticle));
  router.put('/articles/:id', validate({ params: idParam, body: articleBody }), asyncHandler(c.updateArticle));
  router.get('/legal-pages', asyncHandler(c.staffLegalPages));
  router.put(
    '/legal-pages/:slug',
    validate({ params: legalSlugParam, body: legalPageBody }),
    asyncHandler(c.saveLegalPage),
  );
  return router;
};
