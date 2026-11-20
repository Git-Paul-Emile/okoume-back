import {
  ForbiddenError,
  NotFoundError,
  SessionExpiredError,
  UnauthorizedError,
  UnprocessableError,
} from '../../core/errors/AppError.js';
import type { AccessClaims } from '../../core/security/accessTokens.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../core/security/passwords.js';
import { randomBackupCode, sha256 } from '../../core/security/secrets.js';
import { BACKUP_CODE_COUNT, hashBackupCode } from './backup-codes.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import type { VerificationService } from '../verification/verification.service.js';
import { toGrantee, toStaffMeDto } from './staff-auth.dto.js';
import { staffInvitationCodeEmail, staffLoginCodeEmail, staffPasswordResetEmail } from './staff-auth.emails.js';
import type { StaffRecord, StaffRepository } from './staff-auth.repository.js';

export { BACKUP_CODE_COUNT } from './backup-codes.js';

const INVALID_CREDENTIALS = 'E-mail ou mot de passe incorrect.';

export interface StaffAuthDependencies {
  staff: StaffRepository;
  sessions: SessionsService;
  verification: VerificationService;
  email: EmailSender;
  now: () => Date;
}

/**
 * Connexion de l'équipe (cahier des charges, 19.2) : mot de passe puis second facteur obligatoire,
 * codes de secours à usage unique, sessions fermées dès qu'un compte est suspendu ou change de droits.
 */
export const createStaffAuthService = ({ staff, sessions, verification, email, now }: StaffAuthDependencies) => {
  async function openSession(member: StaffRecord) {
    await staff.touchLogin(member.id, now());
    await sessions.recordLogin({ subjectType: 'staff', subjectId: member.id, success: true });
    const tokens = await sessions.issue({ staffId: member.id });
    const backupCodesLeft = await staff.countUnusedBackupCodes(member.id);
    return { member: toStaffMeDto(member), backupCodesLeft, tokens };
  }

  const generateBackupCodes = () => Array.from({ length: BACKUP_CODE_COUNT }, randomBackupCode);

  return {
    /** Étape 1 : mot de passe. Un code est envoyé par e-mail ; la session s'ouvre à l'étape 2. */
    async startLogin(address: string, password: string) {
      const member = await staff.findByEmail(address);
      if (!member?.passwordHash || member.status === 'invited') {
        await burnPasswordCheck(password);
        await sessions.recordLogin({
          subjectType: 'staff',
          subjectId: member?.id ?? null,
          success: false,
          reason: 'unknown',
        });
        throw new UnauthorizedError(INVALID_CREDENTIALS);
      }
      await sessions.assertNotLocked('staff', member.id);
      if (!(await verifyPassword(member.passwordHash, password))) {
        await sessions.recordLogin({ subjectType: 'staff', subjectId: member.id, success: false, reason: 'password' });
        throw new UnauthorizedError(INVALID_CREDENTIALS);
      }
      if (member.status === 'suspended')
        throw new ForbiddenError('Ce compte est suspendu. Contactez l’administrateur principal.');
      const { code, challengeId } = await verification.issue('staff_login', member.id, member.email);
      await email.send(staffLoginCodeEmail(member.email, member.firstName, code));
      return { challengeId };
    },

    /** Mot de passe oublié, étape 1 : réponse identique que l'adresse corresponde ou non à un membre actif. */
    async requestPasswordReset(address: string) {
      const member = await staff.findByEmail(address);
      if (!member?.passwordHash || member.status !== 'active') return;
      const { code } = await verification.issue('password_reset', member.id, member.email);
      await email.send(staffPasswordResetEmail(member.email, member.firstName, code));
    },

    /**
     * Étape 2 : code reçu par e-mail et code de secours, pour garder deux facteurs (la boîte mail seule ne suffit
     * pas). Le code de secours est consommé, toutes les sessions sont fermées ; la connexion suivante redemande
     * le code de connexion habituel.
     */
    async confirmPasswordReset(address: string, code: string, backupCode: string, password: string) {
      const member = await staff.findByEmail(address);
      const refused = new UnprocessableError('Code expiré : demandez-en un nouveau.');
      if (!member?.passwordHash || member.status !== 'active') throw refused;
      await sessions.assertNotLocked('staff', member.id);
      await verification.verifyLatest(member.id, 'password_reset', code);
      if (!(await staff.useBackupCode(member.id, hashBackupCode(backupCode), now()))) {
        await sessions.recordLogin({ subjectType: 'staff', subjectId: member.id, success: false, reason: 'password' });
        throw new UnprocessableError('Code de secours incorrect ou déjà utilisé : demandez un nouveau code.');
      }
      await staff.updatePassword(member.id, await hashPassword(password));
      await sessions.revokeAll({ staffId: member.id });
    },

    /** Étape 2 : code reçu, ou code de secours (utilisable une seule fois). */
    async completeLogin(challengeId: string, proof: { code?: string; backupCode?: string }) {
      let subjectId: string;
      if (proof.code) {
        subjectId = (await verification.verifyChallenge(challengeId, 'staff_login', proof.code)).subjectId;
      } else {
        const challenge = await verification.findOpenChallenge(challengeId, 'staff_login');
        const used = await staff.useBackupCode(challenge.subjectId, hashBackupCode(proof.backupCode ?? ''), now());
        if (!used) {
          await verification.recordFailedAttempt(challengeId);
          throw new UnprocessableError('Code de secours invalide ou déjà utilisé.');
        }
        await verification.closeChallenge(challengeId);
        subjectId = challenge.subjectId;
      }
      const member = await staff.findById(subjectId);
      if (!member || member.status !== 'active') throw new UnauthorizedError(INVALID_CREDENTIALS);
      return openSession(member);
    },

    /** Renouvellement : le compte doit être actif et ses sessions non révoquées depuis l'ouverture. */
    async refresh(refreshToken: string) {
      const { owner, tokens } = await sessions.rotate(refreshToken, 'staff');
      if (!('staffId' in owner)) throw new SessionExpiredError('staff');
      const member = await staff.findById(owner.staffId);
      if (!member || member.status !== 'active') throw new SessionExpiredError('staff');
      return { member: toStaffMeDto(member), tokens };
    },

    logout: (refreshToken: string) => sessions.revoke(refreshToken),

    /** « Fermer mes autres sessions » (19.2) : la session en cours reste ouverte. */
    async revokeOtherSessions(staffId: string, refreshToken: string) {
      if (!(await sessions.revokeOthers(refreshToken, { staffId }))) throw new SessionExpiredError('staff');
    },

    /**
     * Contrôle de chaque requête de l'équipe : compte actif, jeton émis après la dernière révocation.
     * Les droits sont relus en base à chaque fois : un changement de rôle s'applique immédiatement.
     */
    async authenticate(claims: AccessClaims) {
      const member = await staff.findById(claims.subject);
      if (!member || member.status !== 'active') throw new SessionExpiredError('staff');
      if (member.sessionsRevokedAt && claims.issuedAt < member.sessionsRevokedAt)
        throw new SessionExpiredError('staff');
      return { id: member.id, sessionIssuedAt: claims.issuedAt, refundLimit: member.refundLimit, ...toGrantee(member) };
    },

    async me(staffId: string) {
      const member = await staff.findById(staffId);
      if (!member || member.status !== 'active') throw new SessionExpiredError('staff');
      return { member: toStaffMeDto(member), backupCodesLeft: await staff.countUnusedBackupCodes(staffId) };
    },

    /** Invitation, étape 1 : le lien est valide, un code est envoyé à l'adresse invitée. */
    async startInvitation(token: string) {
      const member = await staff.findByInviteTokenHash(sha256(token));
      if (!member || member.status !== 'invited') throw new NotFoundError('Ce lien d’invitation n’est pas valide.');
      if (!member.inviteExpiresAt || member.inviteExpiresAt <= now())
        throw new NotFoundError('Ce lien d’invitation a expiré : demandez-en un nouveau à l’administrateur principal.');
      const { code } = await verification.issue('email_verification', member.id, member.email);
      await email.send(staffInvitationCodeEmail(member.email, member.firstName, code));
      return { firstName: member.firstName, email: member.email };
    },

    /** Invitation, étape 2 : mot de passe choisi, second facteur vérifié, codes de secours remis une seule fois. */
    async acceptInvitation(token: string, code: string, password: string) {
      const member = await staff.findByInviteTokenHash(sha256(token));
      if (!member || member.status !== 'invited' || !member.inviteExpiresAt || member.inviteExpiresAt <= now())
        throw new NotFoundError('Ce lien d’invitation n’est pas valide.');
      await verification.verifyLatest(member.id, 'email_verification', code);
      const backupCodes = generateBackupCodes();
      await staff.acceptInvitation(member.id, await hashPassword(password), backupCodes.map(hashBackupCode));
      return { backupCodes };
    },

    /** Nouveaux codes de secours : les anciens ne fonctionnent plus. Affichés une seule fois. */
    async regenerateBackupCodes(staffId: string) {
      const backupCodes = generateBackupCodes();
      await staff.replaceBackupCodes(staffId, backupCodes.map(hashBackupCode));
      return { backupCodes };
    },
  };
};

export type StaffAuthService = ReturnType<typeof createStaffAuthService>;
