import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { isOwner, type Grantee } from '../../core/security/permissions.js';
import { randomToken, sha256 } from '../../core/security/secrets.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import { logger } from '../../lib/logger.js';
import type { StaffTeamRepository, TeamMemberRecord } from './staff-team.repository.js';
import type { CustomRoleInput, InviteMemberInput, UpdateMemberInput } from './staff-team.schemas.js';

/** Durée de validité d'un lien d'invitation (19.2) */
export const INVITE_DAYS = 7;
const DAY_MS = 24 * 60 * 60_000;

export const toMemberDto = (m: TeamMemberRecord) => ({
  ...m,
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
 * Équipe et droits (2.4, 19.2), réservés à l'administrateur principal : invitations par lien à usage unique,
 * rôles cumulés et personnalisés, suspension, fermeture des sessions et réinitialisation des codes de secours.
 * Tout changement de droits ferme les sessions ouvertes du membre.
 */
export const createStaffTeamService = (deps: StaffTeamDependencies) => {
  const { team, email, appUrl, now } = deps;

  function requireOwner(actor: Grantee) {
    if (!isOwner(actor)) throw new ForbiddenError('Réservé à l’administrateur principal.');
  }

  async function member(id: string) {
    const found = await team.find(id);
    if (!found) throw new NotFoundError('Membre introuvable.');
    return found;
  }

  async function checkCustomRoles(ids: string[] | undefined) {
    if (ids?.length && !(await team.customRolesExist(ids))) throw new UnprocessableError('Rôle personnalisé inconnu.');
  }

  /** Lien envoyé au membre ; il est aussi rendu à l'administrateur pour le transmettre lui-même si besoin. */
  async function sendInvite(m: { email: string; firstName: string }, token: string) {
    const link = `${appUrl}/admin/invitation/${token}`;
    try {
      await email.send({
        to: m.email,
        // Lien d'accès : jamais conservé dans le suivi des envois
        sensitive: true,
        subject: 'Votre accès au back-office Okoumé',
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
    /**
     * Annuaire de l'équipe pour toute personne connectée (attribution d'une demande d'assistance) : prénom et nom
     * des membres actifs seulement. E-mail, rôle et droits restent réservés à l'administrateur principal (list).
     */
    async directory() {
      return (await team.list())
        .filter((m) => m.status === 'active')
        .map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName }));
    },

    async list(actor: Grantee) {
      requireOwner(actor);
      return (await team.list()).map(toMemberDto);
    },

    async invite(input: InviteMemberInput, actor: Grantee) {
      requireOwner(actor);
      await checkCustomRoles(input.customRoleIds);
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
      await checkCustomRoles(input.customRoleIds);
      // Il reste toujours un administrateur principal actif
      const losesOwner =
        current.role === 'super_admin' &&
        current.status === 'active' &&
        ((input.role && input.role !== 'super_admin') || input.status === 'suspended');
      if (losesOwner && (await team.countActiveOwners()) <= 1)
        throw new ConflictError('Il doit rester au moins un administrateur principal actif.');
      const rightsChanged =
        input.role !== undefined ||
        input.extraRoles !== undefined ||
        input.customRoleIds !== undefined ||
        input.status === 'suspended';
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

    async customRoles(actor: Grantee) {
      requireOwner(actor);
      return team.customRoles();
    },

    async saveCustomRole(id: string | undefined, input: CustomRoleInput, actor: Grantee) {
      requireOwner(actor);
      const saved = await team.saveCustomRole(
        { ...(id ? { id } : {}), ...input, permissions: [...new Set(input.permissions)] },
        now(),
      );
      if (!saved) throw new ConflictError('Un rôle porte déjà ce nom.');
      return saved;
    },
  };
};

export type StaffTeamService = ReturnType<typeof createStaffTeamService>;
