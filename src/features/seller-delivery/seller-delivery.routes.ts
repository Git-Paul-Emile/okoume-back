import { Router, type Request, type Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { sellerDeliveryBody } from './seller-delivery.schemas.js';
import type { SellerDeliveryService } from './seller-delivery.service.js';

/** Livraison de la boutique du compte connecté, sous /api/v1/seller/delivery (32.5). */
export const createSellerDeliveryRoutes = (service: SellerDeliveryService, now: () => Date) => {
  const router = Router();
  router.use(requireCustomer(now));
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await service.get(req.customer!.id))),
  );
  router.put(
    '/',
    validate({ body: sellerDeliveryBody }),
    asyncHandler(async (req: Request, res: Response) =>
      sendSuccess(res, await service.save(req.customer!.id, req.body), 200, 'Livraison enregistrée.'),
    ),
  );
  return router;
};
