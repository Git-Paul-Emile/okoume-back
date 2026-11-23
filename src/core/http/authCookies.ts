import type { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '../../config/env.js';
import { ACCESS_TOKEN_SECONDS, type Audience } from '../security/accessTokens.js';
import { randomToken } from '../security/secrets.js';

/**
 * Jetons transportés dans des cookies HttpOnly, jamais accessibles au JavaScript du site
 * (rules/20-qualite/security.md). Clients et équipe ont des cookies distincts.
 */
const NAMES: Record<Audience, { access: string; refresh: string }> = {
  customer: { access: 'ok_at', refresh: 'ok_rt' },
  staff: { access: 'ok_staff_at', refresh: 'ok_staff_rt' },
};
const REFRESH_PATH: Record<Audience, string> = { customer: '/api/v1/auth', staff: '/api/v1/staff/auth' };

/** Jeton anti-CSRF lisible par le front, à renvoyer dans l'en-tête X-CSRF-Token. */
export const CSRF_COOKIE = 'ok_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Avec COOKIE_DOMAIN (.okoza.ga), les cookies valent pour le site et l'API : le site peut lire ok_csrf.
 * Les jetons de session restent HttpOnly, donc illisibles par le JavaScript des deux sites.
 */
const base: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
};

/**
 * Un cookie Domain ne peut viser que le site qui l'héberge. Les requêtes proxifiées par Vercel peuvent
 * présenter une origine .vercel.app alors que l'API conserve COOKIE_DOMAIN=.okoza.ga : dans ce cas,
 * on émet un cookie host-only, que Vercel transmet au navigateur sous l'origine du frontend.
 */
function optionsForRequest(req?: Request): CookieOptions {
  const domain = env.COOKIE_DOMAIN;
  if (!domain) return base;
  const origin = req?.get('origin');
  let requestHost = req?.hostname.toLowerCase();
  try {
    if (origin) requestHost = new URL(origin).hostname.toLowerCase();
    if (!requestHost) return { ...base, domain };
    const cookieDomain = domain.replace(/^\./, '').toLowerCase();
    const matches = requestHost === cookieDomain || requestHost.endsWith(`.${cookieDomain}`);
    return matches ? { ...base, domain } : base;
  } catch {
    return base;
  }
}

export function setAuthCookies(
  res: Response,
  audience: Audience,
  tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
  req?: Request,
) {
  const base = optionsForRequest(req);
  res.cookie(NAMES[audience].access, tokens.accessToken, {
    ...base,
    path: '/api',
    maxAge: ACCESS_TOKEN_SECONDS * 1000,
  });
  res.cookie(NAMES[audience].refresh, tokens.refreshToken, {
    ...base,
    path: REFRESH_PATH[audience],
    expires: tokens.refreshExpiresAt,
  });
  res.cookie(CSRF_COOKIE, randomToken(), { ...base, httpOnly: false, path: '/' });
}

export function clearAuthCookies(res: Response, audience: Audience, req?: Request) {
  const base = optionsForRequest(req);
  res.clearCookie(NAMES[audience].access, { ...base, path: '/api' });
  res.clearCookie(NAMES[audience].refresh, { ...base, path: REFRESH_PATH[audience] });
}

const readCookie = (req: Request, name: string): string | undefined => {
  const value: unknown = req.cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export const readAccessToken = (req: Request, audience: Audience) => readCookie(req, NAMES[audience].access);
export const readRefreshToken = (req: Request, audience: Audience) => readCookie(req, NAMES[audience].refresh);
export const readCsrfCookie = (req: Request) => readCookie(req, CSRF_COOKIE);

/** La requête porte-t-elle un cookie de session (client ou équipe) ? */
export const hasSessionCookie = (req: Request) =>
  Object.values(NAMES).some((n) => readCookie(req, n.access) || readCookie(req, n.refresh));
