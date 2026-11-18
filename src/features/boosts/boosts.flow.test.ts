import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock } from '../../../tests/factories.js';
import { createFakeEmailSender } from '../../infrastructure/email/fakeEmailSender.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const stockManager = { id: 's3', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };
const DAY = 24 * 60 * 60 * 1000;
const page = { page: 1, limit: 20 };

async function setup() {
  const clock = createClock();
  const email = createFakeEmailSender();
  const shop = buildShopServices(clock, email);
  const category = shop.catalog.addCategory({ slug: 'maison', name: 'Maison' });
  const free = await shop.staffShops.createPlan(
    {
      name: 'Gratuit',
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
  const paid = await shop.staffShops.createPlan(
    {
      name: 'Mensuel',
      description: '',
      kind: 'paid',
      price: 5_000,
      periodDays: 30,
      trialDays: 0,
      active: true,
      position: 1,
    },
    owner,
  );
  const plan = await shop.staffBoosts.createPlan(
    { name: 'Une semaine', description: '', durationDays: 7, price: 3_000, active: true, position: 0 },
    owner,
  );
  const seller = shop.shopsStore.addOwner({ email: 'vendeur@example.ga' });
  await shop.shops.open(seller.id, {
    name: 'Maison Nzeng',
    description: '',
    city: 'Libreville',
    district: 'Nzeng-Ayong',
    position: null,
    phone: '066778899',
    acceptedPaymentMethods: ['cash'],
    handoverModes: ['pickup'],
    planId: free.id,
  });
  const create = (title: string, price: number) =>
    shop.listings.create(seller.id, {
      title,
      description: `${title}, en très bon état, à retirer sur place.`,
      categoryId: category.id,
      kind: 'product',
      condition: 'good',
      price,
      quantity: 1,
      photos: ['https://medias.test/listings/photo.webp'],
      minPrice: null,
      sellerNotes: '',
    });
  const publish = async (title: string, price: number) => {
    const draft = await create(title, price);
    await shop.listings.submit(seller.id, draft.id);
    for (const job of shop.pushQueue.jobs.splice(0))
      if (job.name === 'listings.review' && 'version' in job.data)
        await shop.listingReviews.review(job.data.listingId, job.data.version);
    clock.advance(60_000);
    return draft;
  };
  const older = await publish('Table basse en teck', 40_000);
  const newer = await publish('Lampe en rotin', 15_000);
  const declare = (listingId: string, reference: string, amount = 3_000) =>
    shop.boosts.declare(seller.id, listingId, { planId: plan.id, method: 'airtel', reference, amount });
  const titles = async (sort?: 'price') =>
    (await shop.listings.search({ ...page, ...(sort ? { sort } : {}) })).items.map((i) => [i.title, i.sponsored]);
  return { ...shop, clock, email, seller, paid, plan, create, older, newer, declare, titles };
}

describe('mise en avant payante', () => {
  it('ne remonte une annonce, marquée Sponsorisé, qu’après validation du paiement', async () => {
    const { staffBoosts, declare, older, titles, email, pushQueue } = await setup();
    expect(await titles()).toEqual([
      ['Lampe en rotin', false],
      ['Table basse en teck', false],
    ]);
    const boost = await declare(older.id, 'AM5001');
    expect(boost.status).toBe('pending');
    expect(JSON.stringify(pushQueue.jobs)).toContain('vendeurs:valider');
    expect((await titles())[0]).toEqual(['Lampe en rotin', false]);

    const validated = await staffBoosts.decide(boost.id, { status: 'validated' }, owner);
    expect(validated.endsAt).not.toBeNull();
    expect(await titles()).toEqual([
      ['Table basse en teck', true],
      ['Lampe en rotin', false],
    ]);
    // Un tri choisi par l'acheteur reste respecté : la mise en avant ne s'y impose pas
    expect(await titles('price')).toEqual([
      ['Lampe en rotin', false],
      ['Table basse en teck', true],
    ]);
    expect(email.last('vendeur@example.ga')?.subject).toBe('Mise en avant validée');
  });

  it('une nouvelle période suit celle en cours, puis la mise en avant expire', async () => {
    const { staffBoosts, declare, older, titles, clock } = await setup();
    const first = await staffBoosts.decide((await declare(older.id, 'AM6001')).id, { status: 'validated' }, owner);
    clock.advance(2 * DAY);
    const second = await staffBoosts.decide((await declare(older.id, 'AM6002')).id, { status: 'validated' }, owner);
    expect(second.startsAt).toBe(first.endsAt);
    // Jour 13 : la seconde période (jours 7 à 14) court encore ; jour 15 : tout est fini
    clock.advance(11 * DAY);
    expect((await titles())[0]).toEqual(['Table basse en teck', true]);
    clock.advance(2 * DAY);
    expect((await titles())[0]).toEqual(['Lampe en rotin', false]);
  });

  it('refus motivé, montant exact, annonce publiée, une seule mise en avant en attente', async () => {
    const { staffBoosts, declare, older, create, email } = await setup();
    await expect(declare(older.id, 'AM7001', 2_000)).rejects.toMatchObject({ status: 422 });
    const draft = await create('Brouillon de chaise', 10_000);
    await expect(declare(draft.id, 'AM7002')).rejects.toMatchObject({ status: 409 });
    const pending = await declare(older.id, 'AM7003');
    await expect(declare(older.id, 'AM7004')).rejects.toMatchObject({ status: 409 });
    await staffBoosts.decide(pending.id, { status: 'refused', reason: 'Montant non reçu sur le compte.' }, owner);
    expect(email.last('vendeur@example.ga')?.text).toContain('Montant non reçu sur le compte.');
    await expect(staffBoosts.decide(pending.id, { status: 'validated' }, owner)).rejects.toMatchObject({ status: 409 });
    // Après un refus, la même référence peut être déclarée de nouveau
    await expect(declare(older.id, 'AM7003')).resolves.toMatchObject({ status: 'pending' });
  });

  it('une référence de transaction ne sert qu’une fois, entre abonnement et mise en avant', async () => {
    const { shops, declare, older, seller, paid } = await setup();
    await declare(older.id, 'AM8001');
    await expect(
      shops.declarePayment(seller.id, { planId: paid.id, method: 'airtel', reference: 'AM8001', amount: 5_000 }),
    ).rejects.toMatchObject({ code: 'PAYMENT_REFERENCE_USED' });
    await shops.declarePayment(seller.id, { planId: paid.id, method: 'airtel', reference: 'AM8002', amount: 5_000 });
    await expect(declare(older.id, 'AM8002')).rejects.toMatchObject({ code: 'PAYMENT_REFERENCE_USED' });
  });

  it('réserve la vérification au droit vendeurs et l’annonce à son vendeur', async () => {
    const { staffBoosts, boosts, shopsStore, older, plan, seller } = await setup();
    await expect(staffBoosts.list({ page: 1, limit: 20 }, stockManager)).rejects.toMatchObject({ status: 403 });
    const stranger = shopsStore.addOwner();
    await expect(
      boosts.declare(stranger.id, older.id, { planId: plan.id, method: 'moov', reference: 'MM9001', amount: 3_000 }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await boosts.mine(seller.id, page)).total).toBe(0);
  });
});
