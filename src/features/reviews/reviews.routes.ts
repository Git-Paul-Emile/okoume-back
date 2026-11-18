import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer, requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createReviewsController } from './reviews.controller.js';
import {
  decideReviewBody,
  listProductReviewsQuery,
  listStaffReviewsQuery,
  productIdParam,
  reportBody,
  reviewBody,
} from './reviews.schemas.js';
import type { ReviewsService } from './reviews.service.js';

/** Avis sous /api/v1/reviews : lecture publique des avis publiés, dépôt et signalement par un compte. */
export const createReviewsRoutes = (service: ReviewsService, now: () => Date) => {
  const c = createReviewsController(service);
  const customerOnly = requireCustomer(now);
  const router = Router();
  router.get('/ratings', asyncHandler(c.ratings));
  router.get(
    '/products/:productId',
    validate({ params: productIdParam, query: listProductReviewsQuery }),
    asyncHandler(c.forProduct),
  );
  router.post('/photo-uploads', customerOnly, asyncHandler(c.signPhotoUpload));
  router.get('/mine/:productId', customerOnly, validate({ params: productIdParam }), asyncHandler(c.mine));
  router.put(
    '/mine/:productId',
    customerOnly,
    validate({ params: productIdParam, body: reviewBody }),
    asyncHandler(c.save),
  );
  router.post('/:id/reports', customerOnly, validate({ params: idParam, body: reportBody }), asyncHandler(c.report));
  return router;
};

/** Modération par l'équipe, sous /api/v1/staff/reviews. */
export const createStaffReviewsRoutes = (
  service: ReviewsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createReviewsController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', validate({ query: listStaffReviewsQuery }), asyncHandler(c.list));
  router.patch('/:id', validate({ params: idParam, body: decideReviewBody }), asyncHandler(c.decide));
  return router;
};
