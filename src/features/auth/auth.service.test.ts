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

const codeIn = (text: string | undefined) => /\b(\d{6})\b/.exec(text ?? '')?.[1] ?? '';
/** Un code forcément différent du bon, pour que le test ne dépende pas du hasard. */
const wrongCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

async function registeredAndVerified() {
  const services = buildAuthServices();
  await services.auth.register(input);
  await services.auth.verifyEmail(input.email, codeIn(services.email.last(input.email)?.text));
  return services;
}

describe('authentification des clients', () => {
  it('envoie un code à l’inscription et active le compte avec ce code', async () => {
    const { auth, email } = buildAuthServices();
    await auth.register(input);
    const { customer, tokens } = await auth.verifyEmail(input.email, codeIn(email.last(input.email)?.text));
    expect(customer).toMatchObject({ email: input.email, firstName: 'Awa' });
    expect(customer).not.toHaveProperty('passwordHash');
    expect(tokens.accessToken).toBeTruthy();
  });

  it('ne révèle pas un compte existant à l’inscription et prévient son titulaire', async () => {
    const { auth, email, customersStore } = await registeredAndVerified();
    await expect(auth.register({ ...input, password: 'autre12345' })).resolves.toBeUndefined();
    expect(email.last(input.email)?.subject).toBe('Une inscription a été tentée avec votre adresse');
    expect(customersStore.customers).toHaveLength(1);
  });

  it('refuse la connexion tant que l’adresse n’est pas confirmée', async () => {
    const { auth } = buildAuthServices();
    await auth.register(input);
    await expect(auth.login(input.email, input.password)).rejects.toMatchObject({ status: 403 });
  });

  it('donne la même erreur pour un compte inconnu et un mauvais mot de passe', async () => {
    const { auth } = await registeredAndVerified();
    const unknown = await auth.login('personne@example.ga', input.password).catch((e: Error) => e);
    const wrong = await auth.login(input.email, 'mauvais12345').catch((e: Error) => e);
    expect(unknown).toMatchObject({ status: 401 });
    expect(wrong).toMatchObject({ status: 401, message: (unknown as Error).message });
  });

  it('ferme toutes les sessions après un nouveau mot de passe', async () => {
    const { auth, email } = await registeredAndVerified();
    const { tokens } = await auth.login(input.email, input.password);
    await auth.requestPasswordReset(input.email);
    await auth.confirmPasswordReset(input.email, codeIn(email.last(input.email)?.text), 'nouveau12345');
    await expect(auth.refresh(tokens.refreshToken)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await expect(auth.login(input.email, 'nouveau12345')).resolves.toBeTruthy();
  });

  it('limite les essais de code à 5', async () => {
    const { auth, email } = buildAuthServices();
    await auth.register(input);
    const code = codeIn(email.last(input.email)?.text);
    for (let i = 0; i < 5; i++) await auth.verifyEmail(input.email, wrongCode(code)).catch(() => undefined);
    await expect(auth.verifyEmail(input.email, code)).rejects.toMatchObject({
      message: expect.stringContaining('Trop'),
    });
  });
});

describe('changement d’e-mail ou de téléphone', () => {
  it('confirme une nouvelle adresse par un code envoyé à cette adresse et prévient l’ancienne', async () => {
    const { auth, email, customersStore } = await registeredAndVerified();
    const id = customersStore.customers[0]!.id;
    await expect(
      auth.requestContactChange(id, { type: 'email', value: 'awa.ndong@example.ga', password: 'faux' }),
    ).rejects.toMatchObject({ status: 422 });

    await auth.requestContactChange(id, { type: 'email', value: 'awa.ndong@example.ga', password: input.password });
    const code = codeIn(email.last('awa.ndong@example.ga')?.text);
    await expect(auth.confirmContactChange(id, wrongCode(code))).rejects.toMatchObject({ status: 422 });
    const updated = await auth.confirmContactChange(id, code);
    expect(updated.email).toBe('awa.ndong@example.ga');
    expect(email.last(input.email)?.subject).toBe('Vos coordonnées OKOZA ont changé');
  });

  it('n’envoie aucun code pour une adresse déjà prise, sans le révéler', async () => {
    const services = await registeredAndVerified();
    const id = services.customersStore.customers[0]!.id;
    await services.auth.register({ ...input, email: 'pris@example.ga' });
    const sent = services.email.sent.length;
    await expect(
      services.auth.requestContactChange(id, { type: 'email', value: 'pris@example.ga', password: input.password }),
    ).resolves.toBeUndefined();
    expect(services.email.sent).toHaveLength(sent);
  });

  it('change le numéro avec un code envoyé à l’adresse du compte, et refuse un numéro pris', async () => {
    const { auth, email, customersStore } = await registeredAndVerified();
    const id = customersStore.customers[0]!.id;
    await auth.requestContactChange(id, { type: 'phone', value: '077 12 34 56', password: input.password });
    const updated = await auth.confirmContactChange(id, codeIn(email.last(input.email)?.text));
    expect(updated.phone).toBe('077 12 34 56');

    customersStore.customers.push({
      ...customersStore.customers[0]!,
      id: 'autre',
      email: 'b@example.ga',
      phoneKey: '77654321',
    });
    await expect(
      auth.requestContactChange(id, { type: 'phone', value: '077 65 43 21', password: input.password }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
