import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../tests/factories.js';

const owner = { id: 'owner', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const manager = { id: 'm1', role: 'orders_manager' as const, extraRoles: [], customPermissions: [] };

const invite = {
  email: 'paul@okoume.ga',
  firstName: 'Paul',
  lastName: 'Obame',
  role: 'orders_manager' as const,
  extraRoles: [],
  customRoleIds: [],
  refundLimit: null,
};

const setup = () => buildApp().services;

describe('équipe', () => {
  it('invite par un lien à usage unique, envoyé par e-mail, et refuse une adresse déjà prise', async () => {
    const { staffTeam, staffTeamStore, email } = setup();
    const { member, inviteLink } = await staffTeam.invite(invite, owner);
    expect(member.status).toBe('invited');
    expect(inviteLink).toMatch(/^http:\/\/localhost:5173\/admin\/invitation\/[\w-]{40,}$/);
    expect(email.last('paul@okoume.ga')?.text).toContain(inviteLink);
    // Seule l'empreinte du jeton est gardée
    expect(staffTeamStore.members[0]?.inviteTokenHash).not.toContain(inviteLink.split('/').at(-1));
    await expect(staffTeam.invite(invite, owner)).rejects.toMatchObject({ status: 409 });
  });

  it('ferme les sessions quand les droits changent, pas pour un plafond de remboursement', async () => {
    const { staffTeam, staffTeamStore } = setup();
    const { member } = await staffTeam.invite(invite, owner);
    await staffTeam.update(member.id, { refundLimit: 50_000 }, owner);
    expect(staffTeamStore.members[0]?.sessionsRevokedAt).toBeNull();
    await staffTeam.update(member.id, { role: 'catalog_manager' }, owner);
    expect(staffTeamStore.members[0]?.sessionsRevokedAt).toBeInstanceOf(Date);
  });

  it('garde toujours un administrateur principal actif et réserve l’équipe à lui', async () => {
    const { staffTeam, staffTeamStore } = setup();
    const { member } = await staffTeam.invite({ ...invite, role: 'super_admin' }, owner);
    staffTeamStore.members[0]!.status = 'active';
    await expect(staffTeam.update(member.id, { status: 'suspended' }, owner)).rejects.toMatchObject({ status: 409 });
    await expect(staffTeam.update(owner.id, { role: 'stock_manager' }, owner)).rejects.toMatchObject({ status: 422 });
    await expect(staffTeam.list(manager)).rejects.toMatchObject({ status: 403 });
  });

  it('refuse un rôle personnalisé au nom déjà pris ou avec un rôle inconnu', async () => {
    const { staffTeam } = setup();
    await staffTeam.saveCustomRole(undefined, { name: 'Caisse', permissions: ['paiements:valider'] }, owner);
    await expect(
      staffTeam.saveCustomRole(undefined, { name: 'Caisse', permissions: ['paiements:consulter'] }, owner),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      staffTeam.invite({ ...invite, customRoleIds: ['00000000-0000-4000-8000-000000000000'] }, owner),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('annuaire de l’équipe', () => {
  it('donne le nom des membres actifs seulement, sans e-mail ni rôle', async () => {
    const { staffTeam, staffTeamStore } = setup();
    await staffTeam.invite(invite, owner);
    const invited = staffTeamStore.members[0]!;
    expect(await staffTeam.directory()).toEqual([]);

    invited.status = 'active';
    const directory = await staffTeam.directory();
    expect(directory).toEqual([{ id: invited.id, firstName: 'Paul', lastName: 'Obame' }]);
    expect(Object.keys(directory[0]!)).toEqual(['id', 'firstName', 'lastName']);
  });
});
