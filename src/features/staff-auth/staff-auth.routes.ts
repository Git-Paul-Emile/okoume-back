import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff } from '../../core/middlewares/authenticate.js';
import { createAuthLimiter } from '../../core/middlewares/rateLimiters.js';
import { validate } from '../../core/middlewares/validate.js';
import { createStaffAuthController } from './staff-auth.controller.js';
import { acceptInvitationBody, invitationParams, staffLoginBody } from './staff-auth.schemas.js';
import type { StaffAuthService } from './staff-auth.service.js';

/** Connexion de l'equipe, sessions et acceptation des invitations. */
export const createStaffAuthRoutes = (service: StaffAuthService, now: () => Date) => {
  const controller = createStaffAuthController(service);
  const authLimiter = createAuthLimiter();
  const staffOnly = requireStaff(service, now);
  const router = Router();

  router.post('/sessions', authLimiter, validate({ body: staffLoginBody }), asyncHandler(controller.login));
  router.post('/sessions/refresh', asyncHandler(controller.refresh));
  router.delete('/sessions/current', asyncHandler(controller.logout));
  router.delete('/sessions/others', staffOnly, asyncHandler(controller.revokeOtherSessions));
  router.get('/me', staffOnly, asyncHandler(controller.me));
  router.post(
    '/invitations/:token/acceptance',
    authLimiter,
    validate({ params: invitationParams, body: acceptInvitationBody }),
    asyncHandler(controller.acceptInvitation),
  );
  return router;
};
