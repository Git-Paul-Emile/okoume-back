import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';
import { CSRF_HEADER, hasSessionCookie, readCsrfCookie } from '../http/authCookies.js';
import { safeEqual } from '../security/secrets.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF par double jeton : toute modification faite avec un cookie de session doit renvoyer,
 * dans l'en-tête X-CSRF-Token, la valeur du cookie ok_csrf. Un site tiers ne peut pas lire ce cookie.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method) || !hasSessionCookie(req)) return next();
  const cookie = readCsrfCookie(req);
  const header = req.get(CSRF_HEADER);
  if (cookie && header && safeEqual(cookie, header)) return next();
  next(new AppError('Requête refusée : rechargez la page puis réessayez.', 403, 'CSRF_REJECTED'));
};
