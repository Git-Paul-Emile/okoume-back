import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock } from '../../../tests/factories.js';
import { createFakeEmailSender } from '../../infrastructure/email/fakeEmailSender.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const page = { page: 1, limit: 20 };

async function setup(quantity = 2) {
  const clock = createClock();
  const email = createFakeEmailSender();
  const shop = buildShopServices(clock, email);
  const category = shop.catalog.addCategory({ slug: 'meubles', name: 'Meubles' });
  const plan = await shop.staffShops.createPlan(
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
  const seller = shop.shopsStore.addOwner({ email: 'vendeur@example.ga', firstName: 'Paul' });
  await shop.shops.open(seller.id, {
    name: 'Meubles de Paul',
    description: '',
    city: 'Libreville',
    district: 'Glass',
    position: null,
    phone: '066778899',
    acceptedPaymentMethods: ['cash', 'airtel'],
    handoverModes: ['pickup'],
    planId: plan.id,
  });
  const draft = await shop.listings.create(seller.id, {
    title: 'Chaise en bois massif',
    description: 'Chaise en bois massif, solide, vendue à l’unité.',
    categoryId: category.id,
    kind: 'product',
    condition: 'good',
    price: 15_000,
    quantity,
    photos: ['https://medias.test/listings/chaise.webp'],
    minPrice: null,
    sellerNotes: '',
  });
  await shop.listings.submit(seller.id, draft.id);
  for (const job of shop.pushQueue.jobs.splice(0))
    if (job.name === 'listings.review' && 'version' in job.data)
      await shop.listingReviews.review(job.data.listingId, job.data.version);
  const buyer = shop.shopsStore.addOwner({ email: 'acheteur@example.ga', firstName: 'Awa' });
  const ask = (buyerId: string, overrides: Record<string, unknown> = {}) =>
    shop.listingRequests.create(buyerId, {
      listingSlug: draft.slug,
      quantity: 1,
      paymentMethod: 'airtel',
      handover: 'pickup',
      contactPhone: '077123456',
      message: 'Disponible samedi ?',
      ...overrides,
    });
  return { ...shop, email, seller, buyer, listing: draft, ask };
}

describe('demande de commande', () => {
  it('prévient le vendeur et ne partage les téléphones qu’après acceptation', async () => {
    const { listingRequests, seller, buyer, ask, email } = await setup();
    const sent = await ask(buyer.id);
    expect(sent).toMatchObject({ status: 'sent', total: 15_000, shop: { name: 'Meubles de Paul', phone: null } });
    expect(sent.number).toMatch(/^DEM-[A-Z2-9]{8}$/);
    expect(email.last('vendeur@example.ga')?.subject).toBe(`Nouvelle demande de commande ${sent.number}`);
    expect(await listingRequests.sellerGet(seller.id, sent.id)).toMatchObject({
      buyer: { firstName: 'Awa', phone: null },
    });
    await expect(ask(buyer.id)).rejects.toMatchObject({ status: 409 });

    const accepted = await listingRequests.sellerAct(seller.id, sent.id, { action: 'accept' });
    expect(accepted.buyer).toEqual({ firstName: 'Awa', phone: '077123456' });
    expect(await listingRequests.buyerGet(buyer.id, sent.id)).toMatchObject({ shop: { phone: '066778899' } });
    expect(email.last('acheteur@example.ga')?.text).toContain('Okoumé ne l’encaisse pas');
    expect(accepted.history.map((h) => h.status)).toEqual(['sent', 'accepted']);
    expect(JSON.stringify(accepted)).not.toMatch(/paid|payé/);
  });

  it('une vente conclue retire la quantité ; épuisée, l’annonce est vendue puis revient au réassort', async () => {
    const { listingRequests, listings, seller, buyer, ask, listing } = await setup();
    const sent = await ask(buyer.id, { quantity: 2 });
    await listingRequests.sellerAct(seller.id, sent.id, { action: 'accept' });
    const concluded = await listingRequests.sellerAct(seller.id, sent.id, { action: 'conclude' });
    expect(concluded.status).toBe('concluded');
    await expect(listings.publicListing(listing.slug)).resolves.toMatchObject({ sold: true, quantity: 0 });
    expect((await listings.search(page)).total).toBe(0);
    await expect(ask(buyer.id)).rejects.toMatchObject({ status: 404 });

    await listings.update(seller.id, listing.id, { quantity: 3 });
    await expect(listings.publicListing(listing.slug)).resolves.toMatchObject({ sold: false, quantity: 3 });
    expect((await listings.search(page)).total).toBe(1);
  });

  it('ne conclut pas une vente quand la quantité ne suffit plus', async () => {
    const { listingRequests, shopsStore, seller, buyer, ask } = await setup(1);
    const first = await ask(buyer.id);
    const second = await ask(shopsStore.addOwner().id);
    await listingRequests.sellerAct(seller.id, first.id, { action: 'accept' });
    await listingRequests.sellerAct(seller.id, second.id, { action: 'accept' });
    await listingRequests.sellerAct(seller.id, first.id, { action: 'conclude' });
    await expect(listingRequests.sellerAct(seller.id, second.id, { action: 'conclude' })).rejects.toMatchObject({
      status: 409,
    });
    expect((await listingRequests.sellerGet(seller.id, second.id)).status).toBe('accepted');
    await listingRequests.sellerAct(seller.id, second.id, { action: 'not_concluded', reason: 'Plus de stock.' });
  });

  it('refus motivé, annulation par l’acheteur, et plus rien après la conclusion', async () => {
    const { listingRequests, seller, buyer, ask, email } = await setup();
    const refused = await ask(buyer.id);
    await listingRequests.sellerAct(seller.id, refused.id, { action: 'refuse', reason: 'Réservée à un autre client.' });
    expect(email.last('acheteur@example.ga')?.text).toContain('Réservée à un autre client.');

    const cancelled = await ask(buyer.id);
    await listingRequests.sellerAct(seller.id, cancelled.id, { action: 'accept' });
    await listingRequests.cancel(buyer.id, cancelled.id, 'J’ai trouvé ailleurs.');
    expect(email.last('vendeur@example.ga')?.subject).toBe(`Demande ${cancelled.number} annulée par l’acheteur`);
    await expect(listingRequests.sellerAct(seller.id, cancelled.id, { action: 'conclude' })).rejects.toMatchObject({
      status: 409,
    });

    const done = await ask(buyer.id);
    await listingRequests.sellerAct(seller.id, done.id, { action: 'accept' });
    await listingRequests.sellerAct(seller.id, done.id, { action: 'conclude' });
    await expect(listingRequests.cancel(buyer.id, done.id, undefined)).rejects.toMatchObject({ status: 409 });
    expect((await listingRequests.buyerList(buyer.id, page)).total).toBe(3);
  });

  it('respecte les conditions du vendeur et l’annonce', async () => {
    const { seller, buyer, ask } = await setup();
    await expect(ask(buyer.id, { paymentMethod: 'moov' })).rejects.toMatchObject({ status: 422 });
    await expect(ask(buyer.id, { handover: 'seller_delivery' })).rejects.toMatchObject({ status: 422 });
    await expect(ask(buyer.id, { quantity: 3 })).rejects.toMatchObject({ status: 422 });
    await expect(ask(buyer.id, { quantity: null })).rejects.toMatchObject({ status: 422 });
    await expect(ask(seller.id)).rejects.toMatchObject({ status: 422 });
  });

  it('protège les demandes des autres comptes', async () => {
    const { listingRequests, shopsStore, buyer, seller, ask } = await setup();
    const sent = await ask(buyer.id);
    const stranger = shopsStore.addOwner();
    await expect(listingRequests.buyerGet(stranger.id, sent.id)).rejects.toMatchObject({ status: 404 });
    await expect(listingRequests.sellerGet(stranger.id, sent.id)).rejects.toMatchObject({ status: 404 });
    await expect(listingRequests.sellerAct(buyer.id, sent.id, { action: 'accept' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(listingRequests.cancel(seller.id, sent.id, undefined)).rejects.toMatchObject({ status: 404 });
  });
});
