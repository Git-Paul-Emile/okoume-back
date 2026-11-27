import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { createAuthLimiter } from '../../core/middlewares/rateLimiters.js';
import { validate } from '../../core/middlewares/validate.js';
import { createAuthController } from './auth.controller.js';
import { contactChangeBody, loginBody, registerBody } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

/** Inscription, connexion par mot de passe et gestion de session client. */
export const createAuthRoutes = (service: AuthService, now: () => Date) => {
  const controller = createAuthController(service);
  const authLimiter = createAuthLimiter();
  const router = Router();

  router.post('/registrations', authLimiter, validate({ body: registerBody }), asyncHandler(controller.register));
  router.post('/sessions', authLimiter, validate({ body: loginBody }), asyncHandler(controller.login));
  router.post('/sessions/refresh', asyncHandler(controller.refresh));
  router.delete('/sessions/current', asyncHandler(controller.logout));
  router.get('/me', requireCustomer(now), asyncHandler(controller.me));
  router.patch(
    '/contact-changes',
    authLimiter,
    requireCustomer(now),
    validate({ body: contactChangeBody }),
    asyncHandler(controller.changeContact),
  );
  return router;
};
