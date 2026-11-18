import { describe, expect, it } from 'vitest';
import { hashPassword } from '../../core/security/passwords.js';
import { buildApp } from '../../../tests/factories.js';

const PASSWORD = 'Motdepasse-solide-2026';
const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const ordersManager = { id: 's1', role: 'orders_manager' as const, extraRoles: [], customPermissions: [] };
const YEAR = 365 * 24 * 60 * 60_000;

async function setup() {
  const { services } = buildApp();
  services.supportStaff.push({ id: 's0', firstName: 'Inès', lastName: 'Moussavou' });
  const at = services.clock.now();
  const customer = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'awa@example.ga',
    phone: '+241 77 12 34 56',
    phoneKey: '77123456',
    passwordHash: await hashPassword(PASSWORD),
    firstName: 'Awa',
    lastName: 'Ndong',
    status: 'active' as const,
    emailVerifiedAt: at,
    referralCode: 'AWA2026',
    birthDate: null,
    birthdayChoice: 'points' as const,
    createdAt: at,
    lastLoginAt: at,
  };
  services.customersStore.customers.push(customer);
  return { ...services, customer };
}

describe('droits du client sur ses données', () => {
  it('enregistre une demande d’accès avec une échéance à 30 jours, une seule ouverte par type', async () => {
    const { privacy, customer } = await setup();
    const request = await privacy.create(customer.id, { type: 'access', details: '' });
    expect(request).toMatchObject({ status: 'received', name: 'Awa Ndong', email: 'awa@example.ga' });
    expect(request.number).toMatch(/^DP-2026-[A-Z0-9]{6}$/);
    expect(new Date(request.dueAt).getTime() - new Date(request.createdAt).getTime()).toBe(30 * 24 * 60 * 60_000);
    await expect(privacy.create(customer.id, { type: 'access', details: '' })).rejects.toMatchObject({ status: 409 });
  });

  it('exporte les données et garde la trace de l’export dans le suivi', async () => {
    const { privacy, customer } = await setup();
    const data = await privacy.exportMine(customer.id);
    expect(data.profile).toMatchObject({ email: 'awa@example.ga', phone: '+241 77 12 34 56' });
    expect((await privacy.mine(customer.id))[0]).toMatchObject({ type: 'export', status: 'completed' });
  });

  it('supprime le compte avec le bon mot de passe et ne laisse rien d’identifiant', async () => {
    const { privacy, customer, customersStore, privacyStore } = await setup();
    await privacy.create(customer.id, { type: 'access', details: '' });
    await expect(privacy.deleteMine(customer.id, 'mauvais')).rejects.toMatchObject({ status: 422 });
    await privacy.deleteMine(customer.id, PASSWORD);
    expect(customersStore.customers[0]).toMatchObject({
      status: 'anonymized',
      email: `supprime-${customer.id}@anonyme.invalid`,
      phone: null,
      firstName: 'Client',
    });
    expect(privacyStore.requests.every((r) => r.email === '' && r.name === 'Client supprimé')).toBe(true);
    expect(privacyStore.requests.at(-1)).toMatchObject({ type: 'deletion', status: 'completed' });
    await expect(privacy.exportMine(customer.id)).rejects.toMatchObject({ status: 401 });
  });

  it('refuse la suppression tant qu’une commande est en cours, en la nommant', async () => {
    const { privacy, customer, privacyStore } = await setup();
    privacyStore.blocked.set(customer.id, {
      orders: ['CMD-2026-12345'],
      returns: [],
      listingRequests: [],
      shop: false,
    });
    await expect(privacy.deleteMine(customer.id, PASSWORD)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('CMD-2026-12345'),
    });
  });
});

describe('suivi par l’équipe', () => {
  it('prend en charge puis traite une demande avec la réponse au client', async () => {
    const { privacy, customer } = await setup();
    const request = await privacy.create(customer.id, { type: 'correction', details: 'Mon nom est mal écrit.' });
    const started = await privacy.update(request.id, { status: 'in_progress' }, owner);
    expect(started.history.at(-1)).toMatchObject({ by: 'Inès Moussavou', event: 'Prise en charge' });
    await expect(privacy.update(request.id, { status: 'completed' }, owner)).rejects.toMatchObject({ status: 422 });
    const done = await privacy.update(request.id, { status: 'completed', response: 'Nom corrigé.' }, owner);
    expect(done).toMatchObject({ status: 'completed', response: 'Nom corrigé.' });
    await expect(
      privacy.update(request.id, { status: 'refused', response: 'Trop tard.' }, owner),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('réserve le suivi aux droits sur les données sensibles', async () => {
    const { privacy, customer } = await setup();
    const request = await privacy.create(customer.id, { type: 'access', details: '' });
    await expect(privacy.list({ page: 1, limit: 20 }, ordersManager)).resolves.toMatchObject({ total: 1 });
    await expect(privacy.update(request.id, { status: 'in_progress' }, ordersManager)).rejects.toMatchObject({
      status: 403,
    });
    await expect(privacy.exportFor(request.id, ordersManager)).rejects.toMatchObject({ status: 403 });
    const data = await privacy.exportFor(request.id, owner);
    expect(data.profile.email).toBe('awa@example.ga');
  });
});

describe('comptes inactifs', () => {
  it('anonymise un compte sans connexion ni commande depuis 3 ans, pas un compte encore actif', async () => {
    const { privacy, customer, clock, privacyStore, customersStore } = await setup();
    clock.advance(3 * YEAR - 24 * 60 * 60_000);
    expect(await privacy.anonymizeInactive()).toEqual({ examined: 0, anonymized: 0 });
    privacyStore.orderDates.set(customer.id, [clock.now()]);
    // 3 ans civils, dont une année bissextile (2028)
    clock.advance(3 * 24 * 60 * 60_000);
    expect(await privacy.anonymizeInactive()).toEqual({ examined: 0, anonymized: 0 });
    privacyStore.orderDates.delete(customer.id);
    expect(await privacy.anonymizeInactive()).toEqual({ examined: 1, anonymized: 1 });
    expect(customersStore.customers[0]?.status).toBe('anonymized');
    expect(privacyStore.requests[0]).toMatchObject({ type: 'deletion', details: 'Compte inactif depuis 3 ans' });
  });
});
