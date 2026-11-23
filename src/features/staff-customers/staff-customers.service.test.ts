import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../tests/factories.js';
import { mask } from './staff-customers.service.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const catalog = { id: 's1', role: 'catalog_manager' as const, extraRoles: [], customPermissions: [] };
const stock = { id: 's2', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };

function setup() {
  const { services } = buildApp();
  services.staffCustomersStore.customers.push({
    id: 'c1',
    firstName: 'Awa',
    lastName: 'Ndong',
    email: 'awa@example.ga',
    phone: '+241 77 12 34 56',
    status: 'active',
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    lastLoginAt: null,
    orderCount: 3,
    totalSpent: 10_500_000,
    addresses: [{ id: 'a1', label: 'Maison', zoneName: 'Louis', landmark: 'Derrière la pharmacie' }],
    orders: [],
  });
  return services;
}

describe('fichier clients de l’équipe', () => {
  it('retourne les indicateurs commerciaux sans récompenses ni parrainage', async () => {
    const { staffCustomers } = setup();
    const page = await staffCustomers.list({ page: 1, limit: 20 }, owner);
    expect(page.items[0]).toMatchObject({ orderCount: 3, totalSpent: 10_500_000, email: 'awa@example.ga' });
    expect(page.items[0]).not.toHaveProperty('points');
    expect(page.items[0]).not.toHaveProperty('referralCode');
  });

  it('masque coordonnées et repères sans le droit sur les données sensibles', async () => {
    const { staffCustomers } = setup();
    const detail = await staffCustomers.get('c1', catalog);
    expect(detail.email).toBe('aw•••@example.ga');
    expect(detail.phone).toMatch(/^•+56$/);
    expect(detail.addresses[0]?.landmark).toBe('Adresse masquée');
  });

  it('réserve le fichier aux droits sur les clients', async () => {
    const { staffCustomers } = setup();
    await expect(staffCustomers.list({ page: 1, limit: 20 }, stock)).rejects.toMatchObject({ status: 403 });
  });

  it('ne masque pas une valeur absente', () => {
    expect(mask(null)).toBeNull();
    expect(mask('123')).toBe('••••');
  });
});
