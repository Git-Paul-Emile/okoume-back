import { describe, expect, it } from 'vitest';
import { buildAuthServices } from '../../../tests/factories.js';
import { hashPassword } from '../../core/security/passwords.js';
import { sha256 } from '../../core/security/secrets.js';
import { verifyAccessToken } from '../../core/security/accessTokens.js';

const PASSWORD = 'motdepasse-equipe-1';

async function withActiveMember() {
  const services = buildAuthServices();
  const member = services.staffStore.add({ email: 'awa@okoza.ga', passwordHash: await hashPassword(PASSWORD) });
  return { ...services, member };
}

describe('connexion de l’équipe', () => {
  it('ouvre la session directement après le mot de passe', async () => {
    const { staffAuth, member } = await withActiveMember();
    const result = await staffAuth.login(member.email, PASSWORD);
    expect(result.member).toMatchObject({ email: member.email, role: 'super_admin', roles: ['super_admin'], owner: true });
    expect(result.tokens.accessToken).toBeTruthy();
  });

  it('donne la même erreur pour un compte inconnu et un mauvais mot de passe', async () => {
    const { staffAuth, member } = await withActiveMember();
    const unknown = await staffAuth.login('personne@okoza.ga', PASSWORD).catch((error: Error) => error);
    const wrong = await staffAuth.login(member.email, 'mauvais-mot-de-passe').catch((error: Error) => error);
    expect(unknown).toMatchObject({ status: 401 });
    expect(wrong).toMatchObject({ status: 401, message: (unknown as Error).message });
  });

  it('refuse un compte suspendu', async () => {
    const { staffAuth, member, staffStore } = await withActiveMember();
    Object.assign(staffStore.members[0]!, { status: 'suspended' });
    await expect(staffAuth.login(member.email, PASSWORD)).rejects.toMatchObject({ status: 403 });
  });

  it('révoque les sessions ouvertes avant la révocation et garde le rôle admin', async () => {
    const { staffAuth, member, staffStore, clock } = await withActiveMember();
    const { tokens } = await staffAuth.login(member.email, PASSWORD);
    const claims = await verifyAccessToken(tokens.accessToken, 'staff', clock.now());
    expect(claims).not.toBeNull();

    Object.assign(staffStore.members[0]!, { role: 'orders_manager' });
    await expect(staffAuth.authenticate(claims!)).resolves.toMatchObject({ role: 'super_admin' });

    clock.advance(1_000);
    Object.assign(staffStore.members[0]!, { sessionsRevokedAt: clock.now() });
    await expect(staffAuth.authenticate(claims!)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
});

describe('invitations de l’équipe', () => {
  it('active le compte avec le lien reçu et le mot de passe choisi', async () => {
    const { staffAuth, staffStore, clock } = buildAuthServices();
    const token = 'jeton-invitation-de-test';
    const member = staffStore.add({
      email: 'neo@okoza.ga',
      status: 'invited',
      inviteTokenHash: sha256(token),
      inviteExpiresAt: new Date(clock.now().getTime() + 60 * 60_000),
    });

    await staffAuth.acceptInvitation(token, PASSWORD);
    expect(staffStore.members[0]).toMatchObject({ status: 'active', inviteTokenHash: null });
    await expect(staffAuth.login(member.email, PASSWORD)).resolves.toHaveProperty('tokens.accessToken');
    await expect(staffAuth.acceptInvitation(token, PASSWORD)).rejects.toMatchObject({ status: 404 });
  });

  it('refuse une invitation expirée', async () => {
    const { staffAuth, staffStore, clock } = buildAuthServices();
    staffStore.add({
      email: 'neo@okoza.ga',
      status: 'invited',
      inviteTokenHash: sha256('jeton'),
      inviteExpiresAt: new Date(clock.now().getTime() - 1),
    });
    await expect(staffAuth.acceptInvitation('jeton', PASSWORD)).rejects.toMatchObject({ status: 404 });
  });
});
