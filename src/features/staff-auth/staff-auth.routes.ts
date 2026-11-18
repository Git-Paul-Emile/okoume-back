import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff } from '../../core/middlewares/authenticate.js';
import { createAuthLimiter } from '../../core/middlewares/rateLimiters.js';
import { validate } from '../../core/middlewares/validate.js';
import { createStaffAuthController } from './staff-auth.controller.js';
import {
  acceptInvitationBody,
  invitationParams,
  staffLoginBody,
  staffPasswordResetBody,
  staffPasswordResetConfirmBody,
  staffVerifyBody,
} from './staff-auth.schemas.js';
import type { StaffAuthService } from './staff-auth.service.js';

/** Connexion de l'équipe, invitations et codes de secours, sous /api/v1/staff/auth. */
export const createStaffAuthRoutes = (service: StaffAuthService, now: () => Date) => {
  const c = createStaffAuthController(service);
  const authLimiter = createAuthLimiter();
  const staffOnly = requireStaff(service, now);
  const router = Router();
  router.post('/challenges', authLimiter, validate({ body: staffLoginBody }), asyncHandler(c.startLogin));
  router.post(
    '/password-resets',
    authLimiter,
    validate({ body: staffPasswordResetBody }),
    asyncHandler(c.requestPasswordReset),
  );
  router.post(
    '/password-resets/confirmations',
    authLimiter,
    validate({ body: staffPasswordResetConfirmBody }),
    asyncHandler(c.confirmPasswordReset),
  );
  router.post('/sessions', authLimiter, validate({ body: staffVerifyBody }), asyncHandler(c.completeLogin));
  router.post('/sessions/refresh', asyncHandler(c.refresh));
  router.delete('/sessions/current', asyncHandler(c.logout));
  // Sous /sessions : le cookie de renouvellement n'est envoyé que sur ce chemin, il désigne la session à garder
  router.delete('/sessions/others', staffOnly, asyncHandler(c.revokeOtherSessions));
  router.get('/me', staffOnly, asyncHandler(c.me));
  router.post('/backup-codes', staffOnly, asyncHandler(c.regenerateBackupCodes));
  router.post(
    '/invitations/:token/codes',
    authLimiter,
    validate({ params: invitationParams }),
    asyncHandler(c.startInvitation),
  );
  router.post(
    '/invitations/:token/acceptance',
    authLimiter,
    validate({ params: invitationParams, body: acceptInvitationBody }),
    asyncHandler(c.acceptInvitation),
  );
  return router;
};
