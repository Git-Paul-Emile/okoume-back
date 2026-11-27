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
import { listPayoutsQuery, sellerPayoutsQuery } from './payouts.schemas.js';
import type { PayoutsService } from './payouts.service.js';

/** Read-only view of payouts for staff. */
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
  return router;
};

/** Only the authenticated seller's shop is used to scope this list. */
export const createSellerPayoutsRoutes = (service: PayoutsService, now: () => Date) => {
  const router = Router();
  router.use(requireCustomer(now));
  router.get(
    '/',
    validate({ query: sellerPayoutsQuery }),
    asyncHandler(async (req: Request, res: Response) =>
      sendSuccess(res, await service.listForSeller(sellerPayoutsQuery.parse(req.query), req.customer!.id)),
    ),
  );
  return router;
};
