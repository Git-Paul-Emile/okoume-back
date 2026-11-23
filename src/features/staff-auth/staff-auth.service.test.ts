import { describe, expect, it } from 'vitest';
import { buildAuthServices } from '../../../tests/factories.js';
import { hashPassword } from '../../core/security/passwords.js';
import { sha256 } from '../../core/security/secrets.js';
import { verifyAccessToken } from '../../core/security/accessTokens.js';
import { BACKUP_CODE_COUNT } from './staff-auth.service.js';

const PASSWORD = 'motdepasse-equipe-1';
const codeIn = (text: string | undefined) => /\b(\d{6})\b/.exec(text ?? '')?.[1] ?? '';

async function withActiveMember() {
  const services = buildAuthServices();
  const member = services.staffStore.add({ email: 'awa@okoza.ga', passwordHash: await hashPassword(PASSWORD) });
  return { ...services, member };
}

describe('connexion de l’équipe', () => {
  it('exige le code reçu par e-mail après le mot de passe', async () => {
    const { staffAuth, email, member } = await withActiveMember();
    const { challengeId } = await staffAuth.startLogin(member.email, PASSWORD);
    const result = await staffAuth.completeLogin(challengeId, { code: codeIn(email.last(member.email)?.text) });
    expect(result.member).toMatchObject({ email: member.email, role: 'super_admin', roles: ['super_admin'], owner: true });
    expect(result.tokens.accessToken).toBeTruthy();
  });

  it('donne la même erreur pour un compte inconnu et un mauvais mot de passe', async () => {
    const { staffAuth, member } = await withActiveMember();
    const unknown = await staffAuth.startLogin('personne@okoza.ga', PASSWORD).catch((e: Error) => e);
    const wrong = await staffAuth.startLogin(member.email, 'mauvais-mot-de-passe').catch((e: Error) => e);
    expect(unknown).toMatchObject({ status: 401 });
    expect(wrong).toMatchObject({ status: 401, message: (unknown as Error).message });
  });

  it('refuse un compte suspendu', async () => {
    const { staffAuth, member, staffStore } = await withActiveMember();
    Object.assign(staffStore.members[0]!, { status: 'suspended' });
    await expect(staffAuth.startLogin(member.email, PASSWORD)).rejects.toMatchObject({ status: 403 });
  });

  it('accepte un code de secours une seule fois', async () => {
    const { staffAuth, member } = await withActiveMember();
    const { backupCodes } = await staffAuth.regenerateBackupCodes(member.id);
    expect(backupCodes).toHaveLength(BACKUP_CODE_COUNT);
    const first = await staffAuth.startLogin(member.email, PASSWORD);
    const result = await staffAuth.completeLogin(first.challengeId, { backupCode: backupCodes[0]!.toLowerCase() });
    expect(result.backupCodesLeft).toBe(BACKUP_CODE_COUNT - 1);
    const second = await staffAuth.startLogin(member.email, PASSWORD);
    await expect(staffAuth.completeLogin(second.challengeId, { backupCode: backupCodes[0]! })).rejects.toMatchObject({
      status: 422,
    });
  });

  it('rejette un jeton émis avant la révocation des sessions et garde le rôle unique admin', async () => {
    const { staffAuth, email, member, staffStore, clock } = await withActiveMember();
    const { challengeId } = await staffAuth.startLogin(member.email, PASSWORD);
    const { tokens } = await staffAuth.completeLogin(challengeId, { code: codeIn(email.last(member.email)?.text) });
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
  it('active le compte avec le code reçu et remet les codes de secours une seule fois', async () => {
    const { staffAuth, staffStore, email, clock } = buildAuthServices();
    const token = 'jeton-invitation-de-test';
    staffStore.add({
      email: 'neo@okoza.ga',
      status: 'invited',
      inviteTokenHash: sha256(token),
      inviteExpiresAt: new Date(clock.now().getTime() + 60 * 60_000),
    });
    await staffAuth.startInvitation(token);
    const { backupCodes } = await staffAuth.acceptInvitation(
      token,
      codeIn(email.last('neo@okoza.ga')?.text),
      PASSWORD,
    );
    expect(backupCodes).toHaveLength(BACKUP_CODE_COUNT);
    expect(staffStore.members[0]).toMatchObject({ status: 'active', inviteTokenHash: null });
    await expect(staffAuth.startInvitation(token)).rejects.toMatchObject({ status: 404 });
  });

  it('refuse une invitation expirée', async () => {
    const { staffAuth, staffStore, clock } = buildAuthServices();
    staffStore.add({
      email: 'neo@okoza.ga',
      status: 'invited',
      inviteTokenHash: sha256('jeton'),
      inviteExpiresAt: new Date(clock.now().getTime() - 1),
    });
    await expect(staffAuth.startInvitation('jeton')).rejects.toMatchObject({ status: 404 });
  });
});

describe('mot de passe oublié de l’équipe', () => {
  const NEW_PASSWORD = 'nouveau-mot-de-passe-9';

  it('change le mot de passe avec le code reçu et un code de secours, qui est consommé', async () => {
    const { staffAuth, email, member } = await withActiveMember();
    const { backupCodes } = await staffAuth.regenerateBackupCodes(member.id);
    await staffAuth.requestPasswordReset(member.email);
    const code = codeIn(email.last(member.email)?.text);

    await staffAuth.confirmPasswordReset(member.email, code, backupCodes[0]!, NEW_PASSWORD);
    await expect(staffAuth.startLogin(member.email, PASSWORD)).rejects.toMatchObject({ status: 401 });
    await expect(staffAuth.startLogin(member.email, NEW_PASSWORD)).resolves.toHaveProperty('challengeId');

    // Le code de secours utilisé ne sert plus
    const second = await staffAuth.startLogin(member.email, NEW_PASSWORD);
    await expect(staffAuth.completeLogin(second.challengeId, { backupCode: backupCodes[0]! })).rejects.toMatchObject({
      status: 422,
    });
  });

  it('refuse sans code de secours valide : la boîte mail seule ne suffit pas', async () => {
    const { staffAuth, email, member } = await withActiveMember();
    await staffAuth.regenerateBackupCodes(member.id);
    await staffAuth.requestPasswordReset(member.email);
    const code = codeIn(email.last(member.email)?.text);
    await expect(staffAuth.confirmPasswordReset(member.email, code, 'ZZZZ-ZZZZ', NEW_PASSWORD)).rejects.toMatchObject({
      status: 422,
    });
    await expect(staffAuth.startLogin(member.email, PASSWORD)).resolves.toHaveProperty('challengeId');
  });

  it('ne révèle pas une adresse inconnue et n’envoie rien', async () => {
    const { staffAuth, email } = await withActiveMember();
    const sent = email.sent.length;
    await expect(staffAuth.requestPasswordReset('personne@okoza.ga')).resolves.toBeUndefined();
    expect(email.sent).toHaveLength(sent);
  });
});
