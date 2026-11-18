import type { Request, RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';
import { readAccessToken } from '../http/authCookies.js';
import { verifyAccessToken, type AccessClaims } from '../security/accessTokens.js';
import { can, type Permission } from '../security/permissions.js';

/**
 * Exige un client connecté : jeton d'accès valide (signature, public, expiration).
 * L'appartenance de chaque ressource est ensuite vérifiée par le service (protection IDOR).
 */
export const requireCustomer =
  (now: () => Date): RequestHandler =>
  async (req, _res, next) => {
    const token = readAccessToken(req, 'customer');
    const claims = token ? await verifyAccessToken(token, 'customer', now()) : null;
    if (!claims) return next(new UnauthorizedError());
    req.customer = { id: claims.subject };
    next();
  };

/**
 * Identifie le client s'il est connecté, sans l'exiger : commande possible sans compte.
 * Un jeton invalide ou expiré compte comme une visite anonyme.
 */
export const optionalCustomer =
  (now: () => Date): RequestHandler =>
  async (req, _res, next) => {
    const token = readAccessToken(req, 'customer');
    const claims = token ? await verifyAccessToken(token, 'customer', now()) : null;
    if (claims) req.customer = { id: claims.subject };
    next();
  };

/** Ce que le middleware de l'équipe attend du service : relire le compte et ses droits à chaque requête. */
export interface StaffAuthenticator {
  authenticate(claims: AccessClaims): Promise<NonNullable<Request['staff']>>;
}

/** Exige un membre de l'équipe connecté, actif, dont les sessions n'ont pas été révoquées. */
export const requireStaff =
  (authenticator: StaffAuthenticator, now: () => Date): RequestHandler =>
  async (req, _res, next) => {
    const token = readAccessToken(req, 'staff');
    const claims = token ? await verifyAccessToken(token, 'staff', now()) : null;
    if (!claims) return next(new UnauthorizedError());
    // Une erreur levée ici (compte suspendu, session révoquée) est transmise par Express 5 au middleware d'erreur
    req.staff = await authenticator.authenticate(claims);
    next();
  };

/** Exige un droit précis (domaine:action), vérifié côté serveur sur chaque requête. */
export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.staff) return next(new UnauthorizedError());
    next(can(req.staff, permission) ? undefined : new ForbiddenError());
  };
