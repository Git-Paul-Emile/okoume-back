import { describe, expect, it } from 'vitest';
import { hashPassword } from '../../core/security/passwords.js';
import { buildApp } from '../../../tests/factories.js';

const PASSWORD = 'Motdepasse-solide-2026';
const YEAR = 365 * 24 * 60 * 60_000;

async function setup() {
  const { services } = buildApp();
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

describe('anonymisation automatique des comptes inactifs', () => {
  it('attend trois ans sans connexion ni commande, puis anonymise le compte', async () => {
    const { privacy, customer, clock, privacyStore, customersStore } = await setup();
    clock.advance(3 * YEAR - 24 * 60 * 60_000);
    expect(await privacy.anonymizeInactive()).toEqual({ examined: 0, anonymized: 0 });
    privacyStore.orderDates.set(customer.id, [clock.now()]);
    // 3 ans civils, dont une année bissextile (2028)
    clock.advance(3 * 24 * 60 * 60_000);
    expect(await privacy.anonymizeInactive()).toEqual({ examined: 0, anonymized: 0 });
    privacyStore.orderDates.delete(customer.id);
    expect(await privacy.anonymizeInactive()).toEqual({ examined: 1, anonymized: 1 });
    expect(customersStore.customers[0]).toMatchObject({
      status: 'anonymized',
      email: `supprime-${customer.id}@anonyme.invalid`,
      firstName: 'Client',
      lastName: 'supprimé',
    });
  });
});
