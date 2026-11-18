import { describe, expect, it } from 'vitest';
import { buildAuthServices } from '../../../tests/factories.js';
import { REFRESH_LIFETIME_MS } from './sessions.service.js';

describe('sessions', () => {
  it('remplace le jeton de renouvellement à chaque usage', async () => {
    const { sessions } = buildAuthServices();
    const first = await sessions.issue({ customerId: 'c1' });
    const { owner, tokens } = await sessions.rotate(first.refreshToken, 'customer');
    expect(owner).toEqual({ customerId: 'c1' });
    expect(tokens.refreshToken).not.toBe(first.refreshToken);
  });

  it('révoque toute la famille quand un jeton déjà utilisé est présenté', async () => {
    const { sessions } = buildAuthServices();
    const first = await sessions.issue({ customerId: 'c1' });
    const { tokens } = await sessions.rotate(first.refreshToken, 'customer');
    await expect(sessions.rotate(first.refreshToken, 'customer')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await expect(sessions.rotate(tokens.refreshToken, 'customer')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('ferme les autres sessions du membre en gardant la session en cours', async () => {
    const { sessions } = buildAuthServices();
    const current = await sessions.issue({ staffId: 's1' });
    const other = await sessions.issue({ staffId: 's1' });
    expect(await sessions.revokeOthers(current.refreshToken, { staffId: 's2' })).toBe(false);
    expect(await sessions.revokeOthers(current.refreshToken, { staffId: 's1' })).toBe(true);
    await expect(sessions.rotate(other.refreshToken, 'staff')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await expect(sessions.rotate(current.refreshToken, 'staff')).resolves.toBeDefined();
  });

  it('refuse un jeton expiré ou destiné à un autre public', async () => {
    const { sessions, clock } = buildAuthServices();
    const staff = await sessions.issue({ staffId: 's1' });
    await expect(sessions.rotate(staff.refreshToken, 'customer')).rejects.toMatchObject({ status: 401 });
    clock.advance(REFRESH_LIFETIME_MS.staff + 1);
    await expect(sessions.rotate(staff.refreshToken, 'staff')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('bloque un compte après 5 échecs en 15 minutes, puis le libère', async () => {
    const { sessions, clock } = buildAuthServices();
    for (let i = 0; i < 5; i++)
      await sessions.recordLogin({ subjectType: 'customer', subjectId: 'c1', success: false, reason: 'password' });
    await expect(sessions.assertNotLocked('customer', 'c1')).rejects.toMatchObject({
      status: 429,
      code: 'ACCOUNT_LOCKED',
    });
    clock.advance(15 * 60_000 + 1);
    await expect(sessions.assertNotLocked('customer', 'c1')).resolves.toBeUndefined();
  });
});
