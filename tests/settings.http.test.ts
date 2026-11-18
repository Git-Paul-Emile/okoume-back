import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { updateInformationBody } from '../src/features/settings/settings.schemas.js';
import { buildApp } from './factories.js';

const account = {
  method: 'airtel' as const,
  label: 'Airtel Money',
  number: '+241 07 00 00 00',
  beneficiary: 'OKOUME SARL',
  instructions: 'Composez *150#.',
};

describe('réglages publics', () => {
  it('donnent paiement, fidélité et délais, sans les seuils internes de l’équipe', async () => {
    const app = buildApp();
    app.services.informationStore.info.mobileMoney = [
      {
        method: 'airtel',
        label: 'Airtel Money',
        number: '+241 07 00 00 00',
        beneficiary: 'OKOUME SARL',
        instructions: '',
      },
    ];
    const res = await request(app).get('/api/v1/settings').expect(200);
    expect(res.body.data).toMatchObject({
      currency: 'XAF',
      loyalty: { pointValue: 50, minRedeem: 100, earnPer: 1000 },
      tiers: [{ id: 'bronze' }, { id: 'argent', threshold: 300_000 }, { id: 'or', threshold: 1_000_000 }],
      mobileMoney: [{ method: 'airtel', beneficiary: 'OKOUME SARL' }],
      mobileMoneyExpiryHours: 24,
      returnWindowDays: 14,
      maxAddresses: 5,
      supportSla: { high: 4, normal: 24 },
    });
    expect(res.body.data).not.toHaveProperty('reviewAmount');
    expect(res.body.data).not.toHaveProperty('assistantMonthlyBudget');
    expect(res.headers['cache-control']).toContain('public');
  });

  it('se modifient par l’administrateur principal seulement, un compte par opérateur', async () => {
    const app = buildApp();
    await request(app).patch('/api/v1/staff/settings/shop').send({ mobileMoneyExpiryHours: 12 }).expect(401);
    const { informationStore, settings } = app.services;
    const owner = { role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
    const manager = { role: 'orders_manager' as const, extraRoles: [], customPermissions: [] };
    await expect(settings.updateInformation({ mobileMoneyExpiryHours: 12 }, manager)).rejects.toMatchObject({
      status: 403,
    });
    await settings.updateInformation({ mobileMoneyExpiryHours: 12, mobileMoney: [account] }, owner);
    expect(informationStore.info.mobileMoneyExpiryHours).toBe(12);
    expect(updateInformationBody.safeParse({ mobileMoney: [account, account] }).success).toBe(false);
  });
});

describe('codes promotionnels publics', () => {
  it('montrent les codes ouverts à tous, jamais un code personnel ou réservé aux nouveaux clients', async () => {
    const app = buildApp();
    const manager = { role: 'catalog_manager' as const, extraRoles: [], customPermissions: [] };
    const code = (overrides: Record<string, unknown>) =>
      app.services.staffPromoCodes.create(
        {
          code: 'X',
          label: 'Code',
          type: 'percent',
          value: 10,
          minAmount: 0,
          freeDelivery: false,
          newCustomersOnly: false,
          tiers: [],
          startsAt: new Date('2026-11-01'),
          endsAt: new Date('2026-12-31'),
          maxUses: null,
          perCustomer: null,
          active: true,
          customerId: null,
          productIds: [],
          categoryIds: [],
          ...overrides,
        },
        manager,
      );
    await code({ code: 'NOEL10' });
    await code({ code: 'BIENVENUE', newCustomersOnly: true });
    await code({ code: 'INACTIF', active: false });
    const res = await request(app).get('/api/v1/promo-codes').expect(200);
    expect(res.body.data.map((c: { code: string }) => c.code)).toEqual(['NOEL10']);
    expect(res.body.data[0]).not.toHaveProperty('uses');
  });
});
