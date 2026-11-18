import { Router } from 'express';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { createAuthLimiter } from '../../core/middlewares/rateLimiters.js';
import { validate } from '../../core/middlewares/validate.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { createAuthController } from './auth.controller.js';
import {
  contactChangeBody,
  contactChangeConfirmationBody,
  loginBody,
  passwordResetConfirmBody,
  passwordResetRequestBody,
  registerBody,
  resendCodeBody,
  verifyEmailBody,
} from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

/** Comptes clients : inscription, confirmation, connexion, session, mot de passe oublié. */
export const createAuthRoutes = (service: AuthService, now: () => Date) => {
  const c = createAuthController(service);
  const authLimiter = createAuthLimiter();
  const router = Router();
  router.post('/registrations', authLimiter, validate({ body: registerBody }), asyncHandler(c.register));
  router.post('/verifications', authLimiter, validate({ body: verifyEmailBody }), asyncHandler(c.verifyEmail));
  router.post(
    '/verification-codes',
    authLimiter,
    validate({ body: resendCodeBody }),
    asyncHandler(c.resendVerification),
  );
  router.post('/sessions', authLimiter, validate({ body: loginBody }), asyncHandler(c.login));
  router.post('/sessions/refresh', asyncHandler(c.refresh));
  router.delete('/sessions/current', asyncHandler(c.logout));
  router.get('/me', requireCustomer(now), asyncHandler(c.me));
  // Changement d'e-mail ou de téléphone : mot de passe puis code, sous la limite stricte des actions sensibles
  router.post(
    '/contact-changes',
    authLimiter,
    requireCustomer(now),
    validate({ body: contactChangeBody }),
    asyncHandler(c.requestContactChange),
  );
  router.post(
    '/contact-changes/confirmations',
    authLimiter,
    requireCustomer(now),
    validate({ body: contactChangeConfirmationBody }),
    asyncHandler(c.confirmContactChange),
  );
  router.post(
    '/password-resets',
    authLimiter,
    validate({ body: passwordResetRequestBody }),
    asyncHandler(c.requestPasswordReset),
  );
  router.post(
    '/password-resets/confirmations',
    authLimiter,
    validate({ body: passwordResetConfirmBody }),
    asyncHandler(c.confirmPasswordReset),
  );
  return router;
};
