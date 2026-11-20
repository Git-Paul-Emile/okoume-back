import { Router, type Request, type Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import type { SellerDashboardService } from './seller-dashboard.service.js';

/** Espace vendeur, sous /api/v1/seller/dashboard : vue d'ensemble de la boutique du compte connecté. */
export const createSellerDashboardRoutes = (service: SellerDashboardService, now: () => Date) => {
  const router = Router();
  router.use(requireCustomer(now));
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      return sendSuccess(res, await service.overview(req.customer!.id));
    }),
  );
  return router;
};
