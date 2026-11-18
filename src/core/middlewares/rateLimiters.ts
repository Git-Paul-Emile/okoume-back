import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { sendError } from '../http/apiResponse.js';

const FIFTEEN_MINUTES = 15 * 60_000;
const AUTH_MAX_REQUESTS = 10;
/** Plafond par adresse IP, tous comptes confondus : contre les essais en rafale sur de nombreux comptes */
const AUTH_IP_MAX_REQUESTS = 100;
const ORDER_MAX_REQUESTS = 20;

const limiter = (
  limit: number,
  message: string,
  skip?: (req: Request) => boolean,
  keyGenerator?: (req: Request) => string,
) =>
  rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    ...(skip ? { skip } : {}),
    ...(keyGenerator ? { keyGenerator } : {}),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) =>
      sendError(res, { status: 429, message, code: 'TOO_MANY_REQUESTS', requestId: String(req.id ?? '') }),
  });

/**
 * Chaque appel crée un compteur neuf : une application, un compteur. Les instances restent ainsi
 * indépendantes, en test comme entre plusieurs routeurs.
 */

/** Chemins du back-office, sous /api/v1 (montage dans app.ts). */
const isStaffPath = (req: Request) => req.path === '/staff' || req.path.startsWith('/staff/');

/**
 * Limite générale par adresse IP, contre les abus et les robots (RATE_LIMIT_API_MAX). Les écrans du
 * back-office sont comptés à part (createStaffLimiter).
 */
export const createApiLimiter = (max = env.RATE_LIMIT_API_MAX) =>
  limiter(max, 'Trop de requêtes. Réessayez dans quelques minutes.', isStaffPath);

/**
 * Back-office : compteur séparé et plus large (RATE_LIMIT_STAFF_MAX), toujours par adresse IP. Ses routes
 * exigent une session de l'équipe ; la connexion garde sa limite stricte (createAuthLimiter).
 */
export const createStaffLimiter = (max = env.RATE_LIMIT_STAFF_MAX) =>
  limiter(max, 'Trop de requêtes. Réessayez dans quelques minutes.', (req) => !isStaffPath(req));

/** Passage de commande : chaque commande réserve du stock, la limite évite qu'un robot bloque le catalogue. */
export const createOrderLimiter = () =>
  limiter(ORDER_MAX_REQUESTS, 'Trop de commandes en peu de temps. Réessayez dans quelques minutes.');

/** Compte visé par une tentative : adresse, identifiant, défi de connexion ou numéro de commande. */
function targetOf(req: Request) {
  const source = { ...(req.query as Record<string, unknown>), ...((req.body ?? {}) as Record<string, unknown>) };
  const value = source.email ?? source.identifier ?? source.challengeId ?? source.number;
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Limite stricte pour connexion, inscription, mot de passe oublié et suivi sans compte (security.md) : 10 essais
 * par adresse IP ET par compte visé, plus 100 par adresse IP tous comptes confondus. Une équipe qui partage la
 * connexion de la boutique n'est pas bloquée par ses propres connexions ; le compte visé reste protégé (et
 * verrouillé par l'API après plusieurs échecs).
 */
export const createAuthLimiter = (): RequestHandler[] => [
  limiter(AUTH_IP_MAX_REQUESTS, 'Trop de tentatives. Réessayez dans 15 minutes.'),
  limiter(
    AUTH_MAX_REQUESTS,
    'Trop de tentatives. Réessayez dans 15 minutes.',
    undefined,
    (req) => ipKeyGenerator(req.ip ?? '') + ':' + targetOf(req),
  ),
];

/** Assistant d'achat : chaque question coûte un appel au modèle d'IA ; 30 questions par 15 minutes et par adresse. */
export const createAssistantLimiter = () =>
  limiter(30, 'Vous avez posé beaucoup de questions : réessayez dans quelques minutes ou écrivez-nous.');
