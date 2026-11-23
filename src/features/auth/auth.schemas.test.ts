import { describe, expect, it } from 'vitest';
import { staffPasswordResetConfirmBody } from '../staff-auth/staff-auth.schemas.js';
import { contactChangeBody, contactChangeConfirmationBody } from './auth.schemas.js';

describe('schémas des nouvelles démarches de compte', () => {
  it('accepte un code à 6 chiffres et refuse le reste', () => {
    expect(contactChangeConfirmationBody.safeParse({ code: '123456' }).success).toBe(true);
    expect(contactChangeConfirmationBody.safeParse({ code: ' 123456 ' }).success).toBe(true);
    expect(contactChangeConfirmationBody.safeParse({ code: 'dddddd' }).success).toBe(false);
    expect(contactChangeConfirmationBody.safeParse({ code: '12345' }).success).toBe(false);
  });

  it('valide une demande de changement selon son type', () => {
    expect(contactChangeBody.safeParse({ type: 'email', value: ' Awa@Example.ga ', password: 'x' }).data?.value).toBe(
      'awa@example.ga',
    );
    expect(contactChangeBody.safeParse({ type: 'phone', value: '077 12 34 56', password: 'x' }).success).toBe(true);
    expect(contactChangeBody.safeParse({ type: 'phone', value: 'pas un numéro', password: 'x' }).success).toBe(false);
  });

  it('exige code, code de secours et mot de passe solide pour l’équipe', () => {
    const valid = { email: 'awa@okoza.ga', code: '123456', backupCode: 'ABCD-EFGH', password: 'motdepasse-2026' };
    expect(staffPasswordResetConfirmBody.safeParse(valid).success).toBe(true);
    expect(staffPasswordResetConfirmBody.safeParse({ ...valid, code: 'dddddd' }).success).toBe(false);
    expect(staffPasswordResetConfirmBody.safeParse({ ...valid, password: 'court1' }).success).toBe(false);
  });
});
