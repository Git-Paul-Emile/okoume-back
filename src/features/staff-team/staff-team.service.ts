import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { isOwner, type Grantee } from '../../core/security/permissions.js';
import { randomToken, sha256 } from '../../core/security/secrets.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import { logger } from '../../lib/logger.js';
import type { StaffTeamRepository, TeamMemberRecord } from './staff-team.repository.js';
import type { InviteMemberInput, UpdateMemberInput } from './staff-team.schemas.js';

/** Durée de validité d'un lien d'invitation (19.2) */
export const INVITE_DAYS = 7;
const DAY_MS = 24 * 60 * 60_000;

export const toMemberDto = (m: TeamMemberRecord) => ({
  ...m,
  role: 'super_admin' as const,
  inviteExpiresAt: m.inviteExpiresAt?.toISOString() ?? null,
  lastLoginAt: m.lastLoginAt?.toISOString() ?? null,
  createdAt: m.createdAt.toISOString(),
});

export interface StaffTeamDependencies {
  team: StaffTeamRepository;
  email: EmailSender;
  appUrl: string;
  now: () => Date;
}

/**
 * Équipe d'administrateurs, invitations par lien à usage unique, suspension, fermeture des sessions et réinitialisation
 * des codes de secours. Chaque membre actif a le même accès au back-office.
 */
export const createStaffTeamService = (deps: StaffTeamDependencies) => {
  const { team, email, appUrl, now } = deps;

  function requireOwner(actor: Grantee) {
    if (!isOwner(actor)) throw new ForbiddenError('Réservé aux administrateurs.');
  }

  async function member(id: string) {
    const found = await team.find(id);
    if (!found) throw new NotFoundError('Membre introuvable.');
    return found;
  }

  /** Lien envoyé au membre ; il est aussi rendu à l'administrateur pour le transmettre lui-même si besoin. */
  async function sendInvite(m: { email: string; firstName: string }, token: string) {
    const link = `${appUrl}/admin/invitation/${token}`;
    try {
      await email.send({
        to: m.email,
        // Lien d'accès : jamais conservé dans le suivi des envois
        sensitive: true,
        subject: 'Votre accès au back-office OKOZA',
        text: [
          `Bonjour ${m.firstName},`,
          '',
          'Vous êtes invité à rejoindre l’équipe. Choisissez votre mot de passe depuis ce lien :',
          link,
          '',
          `Il est valable ${INVITE_DAYS} jours et ne sert qu’une fois.`,
        ].join('\n'),
      });
    } catch (err) {
      // Le lien reste transmissible par l'administrateur : l'invitation n'est pas perdue
      logger.error({ err }, 'E-mail d’invitation non déposé');
    }
    return link;
  }

  const newInvite = () => {
    const token = randomToken();
    return { token, hash: sha256(token), expiresAt: new Date(now().getTime() + INVITE_DAYS * DAY_MS) };
  };

  return {
    async list(actor: Grantee) {
      requireOwner(actor);
      return (await team.list()).map(toMemberDto);
    },

    async invite(input: InviteMemberInput, actor: Grantee) {
      requireOwner(actor);
      const invite = newInvite();
      const created = await team.invite({
        ...input,
        inviteTokenHash: invite.hash,
        inviteExpiresAt: invite.expiresAt,
      });
      if (!created) throw new ConflictError('Cette adresse appartient déjà à un membre de l’équipe.');
      return { member: toMemberDto(created), inviteLink: await sendInvite(created, invite.token) };
    },

    async renewInvite(id: string, actor: Grantee) {
      requireOwner(actor);
      const invite = newInvite();
      const renewed = await team.renewInvite(id, invite.hash, invite.expiresAt);
      if (!renewed) throw new ConflictError('Ce membre a déjà accepté son invitation.');
      return { member: toMemberDto(renewed), inviteLink: await sendInvite(renewed, invite.token) };
    },

    async update(id: string, input: UpdateMemberInput, actor: Grantee & { id: string }) {
      requireOwner(actor);
      if (id === actor.id) throw new UnprocessableError('Vos propres droits se modifient par un autre administrateur.');
      const current = await member(id);
      if (current.status === 'active' && input.status === 'suspended' && (await team.countActiveStaff()) <= 1)
        throw new ConflictError('Il doit rester au moins un administrateur actif.');
      const rightsChanged = input.status !== undefined;
      const updated = await team.update(id, { ...input, ...(rightsChanged ? { sessionsRevokedAt: now() } : {}) });
      if (!updated) throw new NotFoundError('Membre introuvable.');
      return toMemberDto(updated);
    },

    async revokeSessions(id: string, actor: Grantee) {
      requireOwner(actor);
      await member(id);
      await team.update(id, { sessionsRevokedAt: now() });
    },

    /** Procédure de récupération (19.2) : l'identité est vérifiée hors ligne, le motif est journalisé. */
    async resetBackupCodes(id: string, reason: string, actor: Grantee & { id: string }) {
      requireOwner(actor);
      if (!(await team.resetBackupCodes(id, now()))) throw new NotFoundError('Membre introuvable.');
      logger.warn({ staffId: id, by: actor.id, reason }, 'Codes de secours réinitialisés');
    },
  };
};

export type StaffTeamService = ReturnType<typeof createStaffTeamService>;
