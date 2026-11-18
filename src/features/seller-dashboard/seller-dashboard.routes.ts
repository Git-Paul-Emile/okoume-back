import { Router, type Request, type Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import type { SellerDashboardService } from './seller-dashboard.service.js';

export const createSellerDashboardController = (service: SellerDashboardService) => ({
  async overview(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.overview(req.customer!.id));
  },

  async listingStats(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.listingStats(req.customer!.id, String(req.params.id)));
  },
});

/** Espace vendeur, sous /api/v1/seller/dashboard : vue d'ensemble, et visites d'une annonce jour par jour. */
export const createSellerDashboardRoutes = (service: SellerDashboardService, now: () => Date) => {
  const c = createSellerDashboardController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.get('/', asyncHandler(c.overview));
  router.get('/listings/:id', validate({ params: idParam }), asyncHandler(c.listingStats));
  return router;
};
