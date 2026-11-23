import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { updateInformationBody } from '../src/features/settings/settings.schemas.js';
import { buildApp } from './factories.js';

const account = {
  method: 'airtel' as const,
  label: 'Airtel Money',
  number: '+241 07 00 00 00',
  beneficiary: 'OKOZA SARL',
  instructions: 'Composez *150#.',
};

describe('réglages publics', () => {
  it('donnent les informations de paiement et les délais publics', async () => {
    const app = buildApp();
    app.services.informationStore.info.mobileMoney = [
      {
        method: 'airtel',
        label: 'Airtel Money',
        number: '+241 07 00 00 00',
        beneficiary: 'OKOZA SARL',
        instructions: '',
      },
    ];
    const res = await request(app).get('/api/v1/settings').expect(200);
    expect(res.body.data).toMatchObject({
      currency: 'XAF',
      mobileMoney: [{ method: 'airtel', beneficiary: 'OKOZA SARL' }],
      mobileMoneyExpiryHours: 24,
      returnWindowDays: 14,
      maxAddresses: 5,
      supportSla: { high: 4, normal: 24 },
    });
    expect(res.body.data).not.toHaveProperty('loyalty');
    expect(res.body.data).not.toHaveProperty('referralReward');
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
  it('montrent les codes promo actifs ouverts à tous', async () => {
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
          endsAt: new Date('2026-12-31'),
          maxUses: null,
          active: true,
          productIds: [],
          categoryIds: [],
          ...overrides,
        },
        manager,
      );
    await code({ code: 'NOEL10' });
    await code({ code: 'INACTIF', active: false });
    const res = await request(app).get('/api/v1/promo-codes').expect(200);
    expect(res.body.data.map((c: { code: string }) => c.code)).toEqual(['NOEL10']);
    expect(res.body.data[0]).not.toHaveProperty('uses');
  });
});
