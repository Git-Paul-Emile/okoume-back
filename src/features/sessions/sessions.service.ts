import { randomUUID } from 'node:crypto';
import { AppError, SessionExpiredError } from '../../core/errors/AppError.js';
import { signAccessToken, type Audience } from '../../core/security/accessTokens.js';
import { randomToken, sha256 } from '../../core/security/secrets.js';
import type { SessionOwner, SessionsRepository } from './sessions.repository.js';

/** Durée d'un jeton de renouvellement : 30 jours pour un client, 60 minutes d'inactivité pour l'équipe. */
export const REFRESH_LIFETIME_MS: Record<Audience, number> = {
  customer: 30 * 24 * 60 * 60_000,
  staff: 60 * 60_000,
};

const LOCK_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const audienceOf = (owner: SessionOwner): Audience => ('customerId' in owner ? 'customer' : 'staff');
const subjectOf = (owner: SessionOwner) => ('customerId' in owner ? owner.customerId : owner.staffId);

export const createSessionsService = (repository: SessionsRepository, now: () => Date) => {
  async function issue(owner: SessionOwner, familyId: string = randomUUID()): Promise<IssuedTokens> {
    const at = now();
    const audience = audienceOf(owner);
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(at.getTime() + REFRESH_LIFETIME_MS[audience]);
    await repository.create({ ...owner, familyId, tokenHash: sha256(refreshToken), expiresAt: refreshExpiresAt });
    const accessToken = await signAccessToken({ subject: subjectOf(owner), audience, sessionFamily: familyId }, at);
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  return {
    issue,

    /**
     * Rotation du jeton de renouvellement à chaque usage (rules/20-qualite/security.md).
     * Un jeton déjà utilisé ou révoqué signale un vol possible : toute la famille de sessions est révoquée.
     */
    async rotate(refreshToken: string, audience: Audience) {
      const at = now();
      const session = await repository.findByTokenHash(sha256(refreshToken));
      const owner: SessionOwner | null = session?.customerId
        ? { customerId: session.customerId }
        : session?.staffId
          ? { staffId: session.staffId }
          : null;
      if (!session || !owner || audienceOf(owner) !== audience) throw new SessionExpiredError(audience);
      if (session.usedAt || session.revokedAt) {
        await repository.revokeFamily(session.familyId, at);
        throw new SessionExpiredError(audience);
      }
      if (session.expiresAt <= at) throw new SessionExpiredError(audience);
      if (!(await repository.markUsed(session.id, at))) {
        await repository.revokeFamily(session.familyId, at);
        throw new SessionExpiredError(audience);
      }
      return { owner, tokens: await issue(owner, session.familyId) };
    },

    async revoke(refreshToken: string) {
      const session = await repository.findByTokenHash(sha256(refreshToken));
      if (session) await repository.revokeFamily(session.familyId, now());
    },

    revokeAll: (owner: SessionOwner) => repository.revokeAllFor(owner, now()),

    /** Ferme les autres sessions du compte : false si le jeton présenté n'est pas une session de ce compte. */
    async revokeOthers(refreshToken: string, owner: SessionOwner) {
      const session = await repository.findByTokenHash(sha256(refreshToken));
      const mine =
        !!session && ('staffId' in owner ? session.staffId === owner.staffId : session.customerId === owner.customerId);
      if (!session || !mine) return false;
      await repository.revokeOthersFor(owner, session.familyId, now());
      return true;
    },

    /** Blocage temporaire d'un compte après trop d'échecs, en plus de la limite par adresse IP. */
    async assertNotLocked(subjectType: 'customer' | 'staff', subjectId: string) {
      const failures = await repository.countRecentFailures(
        subjectType,
        subjectId,
        new Date(now().getTime() - LOCK_WINDOW_MS),
      );
      if (failures >= MAX_FAILURES)
        throw new AppError('Trop de tentatives. Réessayez dans 15 minutes.', 429, 'ACCOUNT_LOCKED');
    },

    recordLogin: repository.recordLogin,
  };
};

export type SessionsService = ReturnType<typeof createSessionsService>;
