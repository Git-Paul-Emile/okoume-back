import { describe, expect, it } from 'vitest';
import { contactChangeBody, registerBody } from './auth.schemas.js';
import { acceptInvitationBody, staffLoginBody } from '../staff-auth/staff-auth.schemas.js';

describe('schémas des accès directs', () => {
  it('valide les coordonnées à l’inscription et au changement de compte', () => {
    expect(
      registerBody.safeParse({
        firstName: 'Awa',
        lastName: 'Ndong',
        email: ' Awa@Example.ga ',
        password: 'motdepasse1',
        acceptTerms: true,
      }).success,
    ).toBe(true);
    expect(contactChangeBody.safeParse({ type: 'email', value: ' Awa@Example.ga ' }).data?.value).toBe(
      'awa@example.ga',
    );
    expect(contactChangeBody.safeParse({ type: 'phone', value: '077 12 34 56' }).success).toBe(true);
  });

  it('ne demande aucun code pour un changement de coordonnées ni pour accepter une invitation', () => {
    expect(contactChangeBody.safeParse({ type: 'email', value: 'awa@example.ga', code: '123456' }).success).toBe(false);
    expect(acceptInvitationBody.safeParse({ password: 'motdepasse-2026', code: '123456' }).success).toBe(false);
  });

  it('accepte une connexion admin par e-mail et mot de passe', () => {
    expect(staffLoginBody.safeParse({ email: 'awa@okoza.ga', password: 'secret' }).success).toBe(true);
  });
});
