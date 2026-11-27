import { describe, expect, it } from 'vitest';
import { buildAuthServices } from '../../../tests/factories.js';

const input = {
  email: 'awa@example.ga',
  password: 'motdepasse1',
  firstName: 'Awa',
  lastName: 'Ndong',
  phone: undefined,
  acceptTerms: true as const,
};

describe('authentification des clients', () => {
  it('crée un compte actif et ouvre une session immédiatement', async () => {
    const { auth } = buildAuthServices();
    const result = await auth.register(input);
    expect(result.customer).toMatchObject({ email: input.email, firstName: 'Awa' });
    expect(result.customer).not.toHaveProperty('passwordHash');
    expect(result.tokens.accessToken).toBeTruthy();

    const login = await auth.login(input.email, input.password);
    expect(login.customer.email).toBe(input.email);
    expect(login.tokens.accessToken).toBeTruthy();
  });

  it('refuse une adresse déjà associée à un compte', async () => {
    const { auth } = buildAuthServices();
    await auth.register(input);
    await expect(auth.register(input)).rejects.toMatchObject({ status: 409 });
  });

  it('donne la même erreur pour un compte inconnu et un mauvais mot de passe', async () => {
    const { auth } = buildAuthServices();
    await auth.register(input);
    const unknown = await auth.login('personne@example.ga', input.password).catch((error: Error) => error);
    const wrong = await auth.login(input.email, 'mauvais12345').catch((error: Error) => error);
    expect(unknown).toMatchObject({ status: 401 });
    expect(wrong).toMatchObject({ status: 401, message: (unknown as Error).message });
  });
});

describe('modification des coordonnées', () => {
  it('change directement l’e-mail et le téléphone depuis le compte connecté', async () => {
    const { auth, customersStore } = buildAuthServices();
    await auth.register(input);
    const id = customersStore.customers[0]!.id;

    const emailUpdate = await auth.changeContact(id, { type: 'email', value: 'awa.ndong@example.ga' });
    expect(emailUpdate.email).toBe('awa.ndong@example.ga');

    const phoneUpdate = await auth.changeContact(id, { type: 'phone', value: '077 12 34 56' });
    expect(phoneUpdate.phone).toBe('077 12 34 56');
  });

  it('refuse une coordonnée déjà associée à un autre compte', async () => {
    const { auth } = buildAuthServices();
    await auth.register(input);
    await auth.register({ ...input, email: 'autre@example.ga' });
    const firstId = (await auth.login(input.email, input.password)).customer.id;
    await expect(
      auth.changeContact(firstId, { type: 'email', value: 'autre@example.ga' }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
