import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildAuthServices, buildShopServices, createClock, deliverOrder } from '../../../tests/factories.js';

const ordersManager = {
  id: 's1',
  role: 'orders_manager' as const,
  extraRoles: [],
  customPermissions: [],
  refundLimit: 1_000_000,
};
const stockManager = { id: 's3', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };
const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [], refundLimit: null };

function setup() {
  const clock = createClock();
  const shop = buildShopServices(clock);
  const category = shop.catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const zone = shop.catalog.addZone({ fee: 2_000 });
  const product = shop.catalog.addProduct({ slug: 'pagne', name: 'Pagne', categoryId: category.id }, [
    { price: 10_000, stock: 50 },
  ]);
  const referrer = shop.catalog.addCustomer({ firstName: 'Awa', phone: '077111111' });
  const referee = shop.catalog.addCustomer({ firstName: 'Brice', lastName: 'Obame', referredById: referrer.id });
  const buy = async (customerId: string, phone = '066222222') => {
    const { order } = await shop.orders.place(
      {
        idempotencyKey: randomUUID(),
        lines: [{ variantId: product.variants[0]!.id, quantity: 1 }],
        delivery: {
          recipient: 'Brice Obame',
          phone,
          email: 'brice@example.ga',
          zoneId: zone.id,
          landmark: 'Marché de Nkembo',
        },
        paymentMethod: 'cash',
      },
      customerId,
    );
    await deliverOrder(shop, order.id, ordersManager);
    await shop.staffPayments.record(
      order.id,
      { amount: 12_000, receivedAt: clock.now(), reference: null },
      ordersManager,
    );
    return order;
  };
  const balanceOf = async (customerId: string) => (await shop.loyalty.summary(customerId)).balance;
  return { ...shop, clock, referrer, referee, buy, balanceOf };
}

describe('inscription avec un code parrain', () => {
  it('rattache le filleul à son parrain et refuse un code inconnu', async () => {
    const { auth, customersStore } = buildAuthServices();
    const input = {
      firstName: 'Awa',
      lastName: 'Ndong',
      password: 'motdepasse1',
      acceptTerms: true as const,
      phone: undefined,
    };
    await auth.register({ ...input, email: 'awa@example.ga' });
    const parrain = customersStore.customers[0]!;
    expect(parrain.referralCode).toMatch(/^AWA-[A-Z2-9]{6}$/);
    Object.assign(parrain, { status: 'active' });
    await auth.register({
      ...input,
      firstName: 'Brice',
      email: 'brice@example.ga',
      referralCode: parrain.referralCode,
    });
    expect(customersStore.customers[1]).toMatchObject({ referredById: parrain.id });
    await expect(
      auth.register({ ...input, email: 'cara@example.ga', referralCode: 'ZZZ-000000' }),
    ).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe('première commande livrée et payée', () => {
  it('récompense le parrain une seule fois et offre un code de bienvenue au filleul', async () => {
    const { buy, referrer, referee, balanceOf, catalog, loyaltyRewards } = setup();
    await buy(referee.id);
    expect(await balanceOf(referrer.id)).toBe(300);
    const welcome = catalog.promos.filter((p) => p.customerId === referee.id);
    expect(welcome).toHaveLength(1);
    expect(await loyaltyRewards.personalCodes(referee.id)).toEqual([
      expect.objectContaining({ code: welcome[0]!.code, value: 10 }),
    ]);
    expect(welcome[0]).toMatchObject({ value: 10, maxUses: 1, perCustomer: 1 });
    await buy(referee.id);
    expect(await balanceOf(referrer.id)).toBe(300);
    expect(catalog.promos.filter((p) => p.customerId === referee.id)).toHaveLength(1);
  });

  it('met en attente un parrainage suspect, puis le crédite après vérification', async () => {
    const { buy, referrer, referee, balanceOf, loyaltyRewards } = setup();
    await buy(referee.id, '077111111');
    expect(await balanceOf(referrer.id)).toBe(0);
    const pending = await loyaltyRewards.listReferrals({ status: 'pending', page: 1, limit: 10 }, ordersManager);
    expect(pending.items[0]?.signals).toEqual(['Même numéro de téléphone que le parrain']);
    await expect(
      loyaltyRewards.decideReferral(pending.items[0]!.id, true, 'Couple vérifié par téléphone', stockManager),
    ).rejects.toMatchObject({ status: 403 });
    await loyaltyRewards.decideReferral(pending.items[0]!.id, true, 'Couple vérifié par téléphone', ordersManager);
    expect(await balanceOf(referrer.id)).toBe(300);
    await expect(
      loyaltyRewards.decideReferral(pending.items[0]!.id, false, 'Décision en double', ordersManager),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('ne récompense rien quand le parrainage et la bienvenue sont désactivés', async () => {
    const { buy, referrer, referee, balanceOf, staffLoyalty, catalog } = setup();
    await staffLoyalty.updateSettings({ referralReward: 0, welcomeEnabled: false }, owner);
    await buy(referee.id);
    expect(await balanceOf(referrer.id)).toBe(0);
    expect(catalog.promos.filter((p) => p.customerId === referee.id)).toHaveLength(0);
  });
});

describe('anniversaire', () => {
  it('offre une fois par an les points ou le code choisis par le client', async () => {
    const { loyaltyRewards, catalog, balanceOf } = setup();
    const today = new Date('1994-11-03T00:00:00Z');
    const points = catalog.addCustomer({ firstName: 'Cara', birthDate: today });
    const code = catalog.addCustomer({ firstName: 'Dina', birthDate: today, birthdayChoice: 'code' });
    catalog.addCustomer({ firstName: 'Eli', birthDate: new Date('1990-05-01T00:00:00Z') });
    expect(await loyaltyRewards.grantBirthdays()).toEqual({ granted: 2 });
    expect(await loyaltyRewards.grantBirthdays()).toEqual({ granted: 0 });
    expect(await balanceOf(points.id)).toBe(200);
    expect(catalog.promos.filter((p) => p.customerId === code.id)).toHaveLength(1);
  });

  it('n’offre rien quand la récompense est désactivée, et refuse une date future', async () => {
    const { loyaltyRewards, staffLoyalty, catalog } = setup();
    catalog.addCustomer({ firstName: 'Cara', birthDate: new Date('1994-11-03T00:00:00Z') });
    await staffLoyalty.updateSettings({ birthdayEnabled: false }, owner);
    expect(await loyaltyRewards.grantBirthdays()).toEqual({ granted: 0 });
    const customer = catalog.customers[0]!;
    await expect(
      loyaltyRewards.updatePreferences(customer.id, { birthDate: new Date('2030-01-01T00:00:00Z') }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('suivi du parrainage par le client', () => {
  it('donne le code à partager et le nombre de filleuls récompensés', async () => {
    const { buy, referrer, referee, loyaltyRewards } = setup();
    await buy(referee.id);
    expect(await loyaltyRewards.referral(referrer.id)).toMatchObject({
      referralCode: referrer.referralCode,
      referees: 1,
      rewarded: 1,
      rewardPoints: 300,
    });
  });
});
