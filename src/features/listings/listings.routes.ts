import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { optionalCustomer, requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createListingsController } from './listings.controller.js';
import {
  createListingBody,
  listingSlugParam,
  listingsNearbyBody,
  listingsSearchQuery,
  listMyListingsQuery,
  publicPageQuery,
  reportBody,
  updateListingBody,
} from './listings.schemas.js';
import type { ListingsService } from './listings.service.js';

const statusBody = z.strictObject({ action: z.enum(['submit', 'withdraw']) });

/** Annonces du vendeur connecté, sous /api/v1/seller/listings ; une annonce d'une autre boutique répond 404. */
export const createSellerListingsRoutes = (service: ListingsService, now: () => Date) => {
  const c = createListingsController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.post('/photo-uploads', asyncHandler(c.signPhotoUpload));
  router.post('/', validate({ body: createListingBody }), asyncHandler(c.create));
  router.get('/', validate({ query: listMyListingsQuery }), asyncHandler(c.mine));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  router.get('/:id/share', validate({ params: idParam }), asyncHandler(c.share));
  router.patch('/:id', validate({ params: idParam, body: updateListingBody }), asyncHandler(c.update));
  // Soumission à la vérification ou retrait : un changement d'état demandé, pas une modification de contenu
  router.patch('/:id/status', validate({ params: idParam, body: statusBody }), asyncHandler(c.changeStatus));
  return router;
};

/**
 * Annonces publiques, sous /api/v1/listings : recherche sans position (GET), recherche avec position (POST, la
 * position dans le corps), fiche, et signalement qui exige un compte (13.4).
 */
export const createPublicListingsRoutes = (service: ListingsService, now: () => Date) => {
  const c = createListingsController(service);
  const router = Router();
  router.get('/', validate({ query: listingsSearchQuery }), asyncHandler(c.search));
  router.post('/searches', validate({ body: listingsNearbyBody }), asyncHandler(c.searchNearby));
  // Le visiteur connecté est identifié pour ne pas compter les visites du vendeur sur sa propre annonce
  router.get('/:slug', optionalCustomer(now), validate({ params: listingSlugParam }), asyncHandler(c.publicListing));
  router.post(
    '/:slug/reports',
    requireCustomer(now),
    validate({ params: listingSlugParam, body: reportBody }),
    asyncHandler(c.report),
  );
  return router;
};

/** Annonces publiées d'une boutique, sous /api/v1/shops/:slug/listings. */
export const createShopListingsRoutes = (service: ListingsService) => {
  const c = createListingsController(service);
  const router = Router();
  router.get(
    '/:slug/listings',
    validate({ params: listingSlugParam, query: publicPageQuery }),
    asyncHandler(c.shopListings),
  );
  return router;
};
