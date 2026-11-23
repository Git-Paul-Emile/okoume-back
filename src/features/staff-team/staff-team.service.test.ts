import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../tests/factories.js';

const owner = { id: 'owner', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const manager = { id: 'm1', role: 'orders_manager' as const, extraRoles: [], customPermissions: [] };

const invite = {
  email: 'paul@okoza.ga',
  firstName: 'Paul',
  lastName: 'Obame',
  refundLimit: null,
};

const setup = () => buildApp().services;

describe('équipe', () => {
  it('invite par un lien à usage unique, envoyé par e-mail, et refuse une adresse déjà prise', async () => {
    const { staffTeam, staffTeamStore, email } = setup();
    const { member, inviteLink } = await staffTeam.invite(invite, owner);
    expect(member.status).toBe('invited');
    expect(inviteLink).toMatch(/^http:\/\/localhost:5173\/admin\/invitation\/[\w-]{40,}$/);
    expect(email.last('paul@okoza.ga')?.text).toContain(inviteLink);
    // Seule l'empreinte du jeton est gardée
    expect(staffTeamStore.members[0]?.inviteTokenHash).not.toContain(inviteLink.split('/').at(-1));
    await expect(staffTeam.invite(invite, owner)).rejects.toMatchObject({ status: 409 });
  });

  it('ferme les sessions à la suspension, pas pour un plafond de remboursement', async () => {
    const { staffTeam, staffTeamStore } = setup();
    const { member } = await staffTeam.invite(invite, owner);
    await staffTeam.update(member.id, { refundLimit: 50_000 }, owner);
    expect(staffTeamStore.members[0]?.sessionsRevokedAt).toBeNull();
    staffTeamStore.members[0]!.status = 'active';
    await staffTeam.update(member.id, { status: 'suspended' }, owner);
    expect(staffTeamStore.members[0]?.sessionsRevokedAt).toBeInstanceOf(Date);
  });

  it('garde toujours un administrateur actif et donne les mêmes droits aux membres', async () => {
    const { staffTeam, staffTeamStore } = setup();
    const { member } = await staffTeam.invite(invite, owner);
    staffTeamStore.members[0]!.status = 'active';
    await expect(staffTeam.update(member.id, { status: 'suspended' }, owner)).rejects.toMatchObject({ status: 409 });
    await expect(staffTeam.list(manager)).resolves.toHaveLength(1);
    await expect(
      staffTeam.invite({ ...invite, email: 'marie@okoza.ga' }, manager),
    ).resolves.toMatchObject({ member: { role: 'super_admin' } });
  });
});
