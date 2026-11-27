import { ForbiddenError, NotFoundError, SessionExpiredError, UnauthorizedError } from '../../core/errors/AppError.js';
import type { AccessClaims } from '../../core/security/accessTokens.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../core/security/passwords.js';
import { sha256 } from '../../core/security/secrets.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import { toGrantee, toStaffMeDto } from './staff-auth.dto.js';
import type { StaffRecord, StaffRepository } from './staff-auth.repository.js';

const INVALID_CREDENTIALS = 'E-mail ou mot de passe incorrect.';

export interface StaffAuthDependencies {
  staff: StaffRepository;
  sessions: SessionsService;
  now: () => Date;
}

/** Connexion de l'equipe par identifiant et mot de passe. */
export const createStaffAuthService = ({ staff, sessions, now }: StaffAuthDependencies) => {
  async function openSession(member: StaffRecord) {
    await staff.touchLogin(member.id, now());
    await sessions.recordLogin({ subjectType: 'staff', subjectId: member.id, success: true });
    return { member: toStaffMeDto(member), tokens: await sessions.issue({ staffId: member.id }) };
  }

  return {
    async login(address: string, password: string) {
      const member = await staff.findByEmail(address.trim().toLowerCase());
      if (!member?.passwordHash || member.status === 'invited') {
        await burnPasswordCheck(password);
        await sessions.recordLogin({ subjectType: 'staff', subjectId: member?.id ?? null, success: false, reason: 'unknown' });
        throw new UnauthorizedError(INVALID_CREDENTIALS);
      }
      await sessions.assertNotLocked('staff', member.id);
      if (!(await verifyPassword(member.passwordHash, password))) {
        await sessions.recordLogin({ subjectType: 'staff', subjectId: member.id, success: false, reason: 'password' });
        throw new UnauthorizedError(INVALID_CREDENTIALS);
      }
      if (member.status === 'suspended') throw new ForbiddenError('Ce compte est suspendu. Contactez l’administrateur principal.');
      return openSession(member);
    },

    async refresh(refreshToken: string) {
      const { owner, tokens } = await sessions.rotate(refreshToken, 'staff');
      if (!('staffId' in owner)) throw new SessionExpiredError('staff');
      const member = await staff.findById(owner.staffId);
      if (!member || member.status !== 'active') throw new SessionExpiredError('staff');
      return { member: toStaffMeDto(member), tokens };
    },

    logout: (refreshToken: string) => sessions.revoke(refreshToken),

    async revokeOtherSessions(staffId: string, refreshToken: string) {
      if (!(await sessions.revokeOthers(refreshToken, { staffId }))) throw new SessionExpiredError('staff');
    },

    async authenticate(claims: AccessClaims) {
      const member = await staff.findById(claims.subject);
      if (!member || member.status !== 'active') throw new SessionExpiredError('staff');
      if (member.sessionsRevokedAt && claims.issuedAt < member.sessionsRevokedAt)
        throw new SessionExpiredError('staff');
      return { id: member.id, sessionIssuedAt: claims.issuedAt, ...toGrantee(member) };
    },

    async me(staffId: string) {
      const member = await staff.findById(staffId);
      if (!member || member.status !== 'active') throw new SessionExpiredError('staff');
      return toStaffMeDto(member);
    },

    async acceptInvitation(token: string, password: string) {
      const member = await staff.findByInviteTokenHash(sha256(token));
      if (!member || member.status !== 'invited' || !member.inviteExpiresAt || member.inviteExpiresAt <= now())
        throw new NotFoundError('Ce lien d’invitation n’est pas valide ou a expiré.');
      await staff.acceptInvitation(member.id, await hashPassword(password));
    },
  };
};

export type StaffAuthService = ReturnType<typeof createStaffAuthService>;
