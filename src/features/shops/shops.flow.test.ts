import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock } from '../../../tests/factories.js';
import { createFakeEmailSender } from '../../infrastructure/email/fakeEmailSender.js';
import { addDays } from './shops.rules.js';
import type { OpenShopInput } from './shops.schemas.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const stockManager = { id: 's3', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };
const DAY = 24 * 60 * 60 * 1000;

const shopInput = (planId: string): OpenShopInput => ({
  name: 'Mode de Nzeng-Ayong',
  description: 'Pagnes et tenues sur mesure.',
  city: 'Libreville',
  district: 'Nzeng-Ayong',
  position: { latitude: 0.4162, longitude: 9.4673 },
  phone: '077123456',
  acceptedPaymentMethods: ['cash', 'airtel'],
  handoverModes: ['pickup'],
  planId,
});

async function setup() {
  const clock = createClock();
  const email = createFakeEmailSender();
  const shop = buildShopServices(clock, email);
  const free = await shop.staffShops.createPlan(
    {
      name: 'Accès gratuit',
      description: '',
      kind: 'free',
      price: 0,
      periodDays: null,
      trialDays: 0,
      active: true,
      position: 0,
    },
    owner,
  );
  const monthly = await shop.staffShops.createPlan(
    {
      name: 'Mensuel',
      description: '',
      kind: 'paid',
      price: 5_000,
      periodDays: 30,
      trialDays: 14,
      active: true,
      position: 1,
    },
    owner,
  );
  const noTrial = await shop.staffShops.createPlan(
    {
      name: 'Sans essai',
      description: '',
      kind: 'paid',
      price: 5_000,
      periodDays: 30,
      trialDays: 0,
      active: true,
      position: 2,
    },
    owner,
  );
  const seller = shop.shopsStore.addOwner({ email: 'awa@example.ga', firstName: 'Awa' });
  const pushes = () =>
    shop.pushQueue.jobs.flatMap((j) => (j.name === 'push.send' && 'audience' in j.data ? [j.data] : []));
  return { ...shop, clock, email, free, monthly, noTrial, seller, pushes };
}

describe('ouverture d’une boutique', () => {
  it('ouvre une boutique gratuite visible, une seule par compte', async () => {
    const { shops, seller, free } = await setup();
    const opened = await shops.open(seller.id, shopInput(free.id));
    expect(opened).toMatchObject({ slug: 'mode-de-nzeng-ayong', access: { state: 'active', visible: true } });
    expect(await shops.publicShop('mode-de-nzeng-ayong')).not.toHaveProperty('phone');
    await expect(shops.open(seller.id, shopInput(free.id))).rejects.toMatchObject({ status: 409 });
  });

  it('démarre l’essai d’une offre payante, et sans essai attend le premier paiement', async () => {
    const { shops, shopsStore, seller, monthly, noTrial, clock } = await setup();
    const trial = await shops.open(seller.id, shopInput(monthly.id));
    expect(trial.access).toMatchObject({ state: 'trial', endsAt: addDays(clock.now(), 14).toISOString() });
    const other = shopsStore.addOwner();
    const waiting = await shops.open(other.id, { ...shopInput(noTrial.id), name: 'Mode de Nzeng-Ayong' });
    expect(waiting.slug).toMatch(/^mode-de-nzeng-ayong-[a-z0-9]{4}$/);
    expect(waiting.access).toMatchObject({ state: 'awaiting_payment', visible: false });
    await expect(shops.publicShop(waiting.slug)).rejects.toMatchObject({ status: 404 });
  });

  it('refuse un compte à l’adresse non vérifiée et une offre désactivée', async () => {
    const { shops, shopsStore, staffShops, free } = await setup();
    const unverified = shopsStore.addOwner({ status: 'pending_verification' });
    await expect(shops.open(unverified.id, shopInput(free.id))).rejects.toMatchObject({ status: 422 });
    await staffShops.updatePlan(free.id, { active: false }, owner);
    await expect(shops.open(shopsStore.addOwner().id, shopInput(free.id))).rejects.toMatchObject({ status: 422 });
  });
});

describe('paiement de l’abonnement', () => {
  it('ne prolonge l’accès qu’après validation, en suivant l’essai, et prévient le vendeur', async () => {
    const { shops, staffShops, seller, monthly, clock, email, pushes } = await setup();
    await shops.open(seller.id, shopInput(monthly.id));
    const declared = await shops.declarePayment(seller.id, {
      planId: monthly.id,
      method: 'airtel',
      reference: 'AM260001',
      amount: 5_000,
    });
    expect(declared.status).toBe('pending');
    expect(pushes().at(-1)).toMatchObject({ audience: { permission: 'vendeurs:valider' } });
    expect((await shops.mine(seller.id)).access.state).toBe('trial');

    const validated = await staffShops.decidePayment(declared.id, { status: 'validated' }, owner);
    expect(validated.periodEnd).toBe(addDays(clock.now(), 14 + 30).toISOString());
    expect((await shops.mine(seller.id)).access).toMatchObject({ state: 'active' });
    expect(email.last('awa@example.ga')?.subject).toBe('Paiement de votre boutique validé');
    expect(pushes().at(-1)).toMatchObject({ audience: { customerId: seller.id, topic: 'shop' } });
    await expect(staffShops.decidePayment(declared.id, { status: 'validated' }, owner)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('refuse un montant différent de l’offre, un second paiement en attente et une référence déjà utilisée', async () => {
    const { shops, staffShops, seller, monthly } = await setup();
    await shops.open(seller.id, shopInput(monthly.id));
    const pay = { planId: monthly.id, method: 'moov' as const, reference: 'MM42', amount: 5_000 };
    await expect(shops.declarePayment(seller.id, { ...pay, amount: 4_000 })).rejects.toMatchObject({ status: 422 });
    const first = await shops.declarePayment(seller.id, pay);
    await expect(shops.declarePayment(seller.id, { ...pay, reference: 'MM43' })).rejects.toMatchObject({ status: 409 });
    await staffShops.decidePayment(first.id, { status: 'validated' }, owner);
    await expect(shops.declarePayment(seller.id, pay)).rejects.toMatchObject({ code: 'PAYMENT_REFERENCE_USED' });
  });

  it('un refus garde son motif et laisse la référence réutilisable', async () => {
    const { shops, staffShops, seller, noTrial, email } = await setup();
    await shops.open(seller.id, shopInput(noTrial.id));
    const pay = { planId: noTrial.id, method: 'airtel' as const, reference: 'AM7', amount: 5_000 };
    const first = await shops.declarePayment(seller.id, pay);
    const refused = await staffShops.decidePayment(first.id, { status: 'refused', reason: 'Montant non reçu.' }, owner);
    expect(refused).toMatchObject({ status: 'refused', decisionReason: 'Montant non reçu.', periodEnd: null });
    expect(email.last('awa@example.ga')?.text).toContain('Montant non reçu.');
    expect((await shops.mine(seller.id)).access.state).toBe('awaiting_payment');
    await expect(shops.declarePayment(seller.id, pay)).resolves.toMatchObject({ status: 'pending' });
  });

  it('une offre payante ne s’active pas sans paiement ; une offre gratuite si', async () => {
    const { shops, seller, monthly, noTrial, free } = await setup();
    await shops.open(seller.id, shopInput(monthly.id));
    await expect(shops.changePlan(seller.id, noTrial.id)).rejects.toMatchObject({ status: 422 });
    expect((await shops.changePlan(seller.id, free.id)).access).toMatchObject({ state: 'active', endsAt: null });
  });
});

describe('administration des boutiques', () => {
  it('une suspension masque la boutique et prévient le vendeur ; la réactivation la rend visible', async () => {
    const { shops, staffShops, seller, free, email } = await setup();
    const opened = await shops.open(seller.id, shopInput(free.id));
    await staffShops.act(opened.id, { action: 'suspend', reason: 'Annonces trompeuses signalées.' }, owner);
    await expect(shops.publicShop(opened.slug)).rejects.toMatchObject({ status: 404 });
    expect(email.last('awa@example.ga')?.subject).toBe('Votre boutique est suspendue');
    await expect(
      staffShops.act(opened.id, { action: 'suspend', reason: 'Encore une fois.' }, owner),
    ).rejects.toMatchObject({ status: 409 });
    await staffShops.act(opened.id, { action: 'reinstate' }, owner);
    await expect(shops.publicShop(opened.slug)).resolves.toMatchObject({ verified: false });
    await staffShops.act(opened.id, { action: 'verify' }, owner);
    await expect(shops.publicShop(opened.slug)).resolves.toMatchObject({ verified: true });
  });

  it('réserve l’administration au droit vendeurs et vérifie les conditions d’une offre', async () => {
    const { staffShops, monthly } = await setup();
    await expect(staffShops.plans(stockManager)).rejects.toMatchObject({ status: 403 });
    await expect(staffShops.updatePlan(monthly.id, { periodDays: null }, owner)).rejects.toMatchObject({ status: 422 });
    await expect(staffShops.updatePlan(monthly.id, { kind: 'free' }, owner)).rejects.toMatchObject({ status: 422 });
  });
});

describe('rappels d’échéance', () => {
  it('prévient une fois avant la fin de l’essai, puis la boutique passe en grâce puis en expiration', async () => {
    const { shops, seller, monthly, clock, email } = await setup();
    await shops.open(seller.id, shopInput(monthly.id));
    clock.advance(10 * DAY);
    expect(await shops.sendAccessReminders()).toBe(1);
    expect(await shops.sendAccessReminders()).toBe(0);
    expect(email.last('awa@example.ga')?.subject).toMatch(/^La période d’essai de votre boutique se termine le/);
    clock.advance(5 * DAY);
    expect((await shops.mine(seller.id)).access).toMatchObject({ state: 'grace', visible: true });
    clock.advance(3 * DAY);
    expect((await shops.mine(seller.id)).access).toMatchObject({ state: 'expired', visible: false });
  });
});
