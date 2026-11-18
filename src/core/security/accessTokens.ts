import { jwtVerify, SignJWT } from 'jose';
import { env } from '../../config/env.js';

/** Durée du jeton d'accès (rules/20-qualite/security.md) : 15 minutes. */
export const ACCESS_TOKEN_SECONDS = 15 * 60;
const ISSUER = 'okoume-api';
const key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export type Audience = 'customer' | 'staff';

export interface AccessClaims {
  subject: string;
  audience: Audience;
  /** Famille de session, pour relier le jeton à sa session révocable */
  sessionFamily: string;
  /** Ouverture de la session, pour la révocation des sessions de l'équipe */
  issuedAt: Date;
}

export const signAccessToken = (claims: Omit<AccessClaims, 'issuedAt'>, now: Date) =>
  new SignJWT({ sid: claims.sessionFamily })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.subject)
    .setAudience(claims.audience)
    .setIssuer(ISSUER)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + ACCESS_TOKEN_SECONDS)
    .sign(key);

/** Vérifie signature, émetteur, public et expiration ; renvoie null si le jeton est invalide. */
export async function verifyAccessToken(token: string, audience: Audience, now: Date): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: ISSUER,
      audience,
      algorithms: ['HS256'],
      currentDate: now,
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || typeof payload.iat !== 'number')
      return null;
    return { subject: payload.sub, audience, sessionFamily: payload.sid, issuedAt: new Date(payload.iat * 1000) };
  } catch {
    return null;
  }
}
