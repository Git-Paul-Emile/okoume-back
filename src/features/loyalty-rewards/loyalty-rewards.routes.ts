import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer, requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createLoyaltyRewardsController } from './loyalty-rewards.controller.js';
import { listReferralsQuery, preferencesBody, referralDecisionBody } from './loyalty-rewards.schemas.js';
import type { LoyaltyRewardsService } from './loyalty-rewards.service.js';

/** Parrainage, codes personnels et préférences du client, sous /api/v1/loyalty (referral, codes, preferences). */
export const createCustomerRewardsRoutes = (service: LoyaltyRewardsService, now: () => Date) => {
  const c = createLoyaltyRewardsController(service);
  const customerOnly = requireCustomer(now);
  const router = Router();
  router.get('/referral', customerOnly, asyncHandler(c.referral));
  router.get('/codes', customerOnly, asyncHandler(c.personalCodes));
  router.put('/preferences', customerOnly, validate({ body: preferencesBody }), asyncHandler(c.updatePreferences));
  return router;
};

/** Vérification des parrainages, sous /api/v1/staff/referral-rewards ; droit clients:valider vérifié par le service. */
export const createStaffReferralRoutes = (
  service: LoyaltyRewardsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createLoyaltyRewardsController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', validate({ query: listReferralsQuery }), asyncHandler(c.listReferrals));
  router.patch('/:id', validate({ params: idParam, body: referralDecisionBody }), asyncHandler(c.decideReferral));
  return router;
};
