import { Router, type Request, type Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import {
  requireCustomer,
  requirePermission,
  requireStaff,
  type StaffAuthenticator,
} from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { listPayoutsQuery, markPayoutPaidBody, sellerPayoutsQuery } from './payouts.schemas.js';
import type { PayoutsService } from './payouts.service.js';

/** Reversements aux vendeurs, sous /api/v1/staff/payouts (32.6). */
export const createStaffPayoutsRoutes = (
  service: PayoutsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const router = Router();
  router.use(requireStaff(authenticator, now), requirePermission('paiements:consulter'));
  router.get(
    '/',
    validate({ query: listPayoutsQuery }),
    asyncHandler(async (req: Request, res: Response) =>
      sendSuccess(res, await service.listForStaff(listPayoutsQuery.parse(req.query), req.staff!)),
    ),
  );
  router.post(
    '/:id/payment',
    validate({ params: idParam, body: markPayoutPaidBody }),
    asyncHandler(async (req: Request, res: Response) =>
      sendSuccess(
        res,
        await service.markPaid(String(req.params.id), req.body, req.staff!),
        200,
        'Reversement enregistré.',
      ),
    ),
  );
  return router;
};

/** Reversements de la boutique du compte connecté, sous /api/v1/seller/payouts. */
export const createSellerPayoutsRoutes = (service: PayoutsService, now: () => Date) => {
  const router = Router();
  router.use(requireCustomer(now));
  router.get(
    '/',
    validate({ query: sellerPayoutsQuery }),
    asyncHandler(async (req: Request, res: Response) =>
      sendSuccess(res, await service.listForSeller(req.customer!.id, sellerPayoutsQuery.parse(req.query))),
    ),
  );
  return router;
};
