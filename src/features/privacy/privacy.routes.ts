import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer, requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { createAuthLimiter } from '../../core/middlewares/rateLimiters.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createPrivacyController } from './privacy.controller.js';
import {
  accountDeletionBody,
  createPrivacyRequestBody,
  listPrivacyRequestsQuery,
  updatePrivacyRequestBody,
} from './privacy.schemas.js';
import type { PrivacyService } from './privacy.service.js';

/** Droits du client sur ses données, sous /api/v1/me : demandes, export, suppression du compte. */
export const createPrivacyRoutes = (service: PrivacyService, now: () => Date) => {
  const c = createPrivacyController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.get('/privacy-requests', asyncHandler(c.mine));
  router.post('/privacy-requests', validate({ body: createPrivacyRequestBody }), asyncHandler(c.create));
  router.post('/data-exports', asyncHandler(c.exportMine));
  // Mot de passe redemandé : limite stricte contre les essais répétés
  router.post(
    '/account-deletion',
    createAuthLimiter(),
    validate({ body: accountDeletionBody }),
    asyncHandler(c.deleteMine),
  );
  return router;
};

/** Suivi par l'équipe, sous /api/v1/staff/privacy-requests. */
export const createStaffPrivacyRoutes = (
  service: PrivacyService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createPrivacyController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', validate({ query: listPrivacyRequestsQuery }), asyncHandler(c.list));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  router.post('/:id/exports', validate({ params: idParam }), asyncHandler(c.exportFor));
  router.patch('/:id', validate({ params: idParam, body: updatePrivacyRequestBody }), asyncHandler(c.update));
  return router;
};
