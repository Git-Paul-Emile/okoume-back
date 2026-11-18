import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock } from '../../../tests/factories.js';
import { createFakeEmailSender } from '../../infrastructure/email/fakeEmailSender.js';
import { ReviewUnavailableError } from '../../infrastructure/ai/listingReviewer.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const stockManager = { id: 's3', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };
const photo = (n: number) => `https://medias.test/listings/photo-${n}.webp`;

async function setup() {
  const clock = createClock();
  const email = createFakeEmailSender();
  const shop = buildShopServices(clock, email);
  const category = shop.catalog.addCategory({ slug: 'robes', name: 'Robes', fullName: 'Mode > Femme > Robes' });
  const collection = shop.catalog.addCategory({ slug: 'selection', name: 'Sélection', isCollection: true });
  const plan = await shop.staffShops.createPlan(
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
  const seller = shop.shopsStore.addOwner({ email: 'awa@example.ga' });
  const opened = await shop.shops.open(seller.id, {
    name: 'Pagnes d’Awa',
    description: '',
    city: 'Libreville',
    district: 'Louis',
    position: null,
    phone: '077123456',
    acceptedPaymentMethods: ['cash', 'airtel'],
    handoverModes: ['pickup'],
    planId: plan.id,
  });
  const draft = (overrides: Record<string, unknown> = {}) =>
    shop.listings.create(seller.id, {
      title: 'Robe en pagne wax taille M',
      description: 'Robe longue en pagne wax, cousue main, portée une seule fois.',
      categoryId: category.id,
      kind: 'product',
      condition: 'like_new',
      price: 25_000,
      quantity: 1,
      photos: [photo(1)],
      minPrice: null,
      sellerNotes: '',
      ...overrides,
    });
  /** Exécute les vérifications déposées dans la file, comme le worker. */
  const runReviews = async () => {
    for (const job of shop.pushQueue.jobs.splice(0))
      if (job.name === 'listings.review' && 'version' in job.data)
        await shop.listingReviews.review(job.data.listingId, job.data.version);
  };
  const staffPushes = () =>
    shop.pushQueue.jobs.flatMap((j) =>
      j.name === 'push.send' && 'audience' in j.data && 'permission' in j.data.audience ? [j.data] : [],
    );
  return { ...shop, clock, email, category, collection, seller, opened, draft, runReviews, staffPushes };
}

describe('soumission et vérification assistée', () => {
  it('un brouillon n’est visible qu’après soumission et avis favorable', async () => {
    const { listings, listingsStore, draft, runReviews, seller, email } = await setup();
    const created = await draft();
    expect(created).toMatchObject({ status: 'draft', city: 'Libreville', district: 'Louis' });
    await expect(listings.publicListing(created.slug)).rejects.toMatchObject({ status: 404 });

    await listings.submit(seller.id, created.id);
    expect((await listings.get(seller.id, created.id)).status).toBe('in_review');
    await runReviews();
    const published = await listings.publicListing(created.slug);
    expect(published).toMatchObject({ title: 'Robe en pagne wax taille M', shop: { name: 'Pagnes d’Awa' } });
    expect(published).not.toHaveProperty('status');
    expect(email.last('awa@example.ga')?.subject).toBe('Votre annonce « Robe en pagne wax taille M » est publiée');
    expect(listingsStore.reviews).toMatchObject([{ source: 'ai', outcome: 'approved', model: 'modele-de-test' }]);
  });

  it('transmet les corrections au vendeur et ignore un avis rendu pour une version dépassée', async () => {
    const { listings, listingReviews, reviewer, draft, runReviews, seller, email, pushQueue } = await setup();
    const created = await draft();
    reviewer.answer({
      outcome: 'changes_requested',
      issues: [{ field: 'description', message: 'Retirez le numéro de téléphone : le contact passe par le tchat.' }],
    });
    await listings.submit(seller.id, created.id);
    await runReviews();
    const toFix = await listings.get(seller.id, created.id);
    expect(toFix).toMatchObject({ status: 'changes_requested', lastReview: { outcome: 'changes_requested' } });
    expect(email.last('awa@example.ga')?.text).toContain('- Description : Retirez le numéro de téléphone');

    await listings.update(seller.id, created.id, {
      description: 'Robe longue en pagne wax, cousue main, très bon état.',
    });
    await listings.submit(seller.id, created.id);
    reviewer.answer({ outcome: 'approved', issues: [] });
    await listingReviews.review(created.id, 1);
    expect((await listings.get(seller.id, created.id)).status).toBe('in_review');
    expect(
      pushQueue.jobs.some((j) => j.name === 'listings.review' && 'version' in j.data && j.data.version === 2),
    ).toBe(true);
    await runReviews();
    expect((await listings.get(seller.id, created.id)).status).toBe('published');
  });

  it('une modification du prix d’une annonce publiée la renvoie en vérification et la masque', async () => {
    const { listings, draft, runReviews, seller } = await setup();
    const created = await draft();
    await listings.submit(seller.id, created.id);
    await runReviews();
    await listings.update(seller.id, created.id, { quantity: 2 });
    await expect(listings.publicListing(created.slug)).resolves.toMatchObject({ quantity: 2 });
    await listings.update(seller.id, created.id, { price: 5_000 });
    await expect(listings.publicListing(created.slug)).rejects.toMatchObject({ status: 404 });
    await runReviews();
    await expect(listings.publicListing(created.slug)).resolves.toMatchObject({ price: 5_000 });
  });

  it('refuse une annonce incomplète, une photo hébergée ailleurs et une collection', async () => {
    const { listings, draft, seller, collection } = await setup();
    const noPhoto = await draft({ photos: [] });
    await expect(listings.submit(seller.id, noPhoto.id)).rejects.toMatchObject({ status: 422 });
    await expect(draft({ photos: ['https://autre-site.example/photo.jpg'] })).rejects.toMatchObject({ status: 422 });
    await expect(draft({ kind: 'service', condition: 'new', quantity: null })).rejects.toMatchObject({ status: 422 });
    await expect(draft({ categoryId: collection.id })).rejects.toMatchObject({ status: 422 });
    await expect(draft({ kind: 'service', condition: null, quantity: null, photos: [] })).resolves.toMatchObject({
      kind: 'service',
    });
  });

  it('protège les annonces d’un vendeur des autres comptes', async () => {
    const { listings, shopsStore, draft } = await setup();
    const created = await draft();
    const other = shopsStore.addOwner();
    await expect(listings.get(other.id, created.id)).rejects.toMatchObject({ status: 404 });
    await expect(listings.update(other.id, created.id, { price: 1 })).rejects.toMatchObject({ status: 404 });
  });
});

describe('modération humaine', () => {
  it('un doute de l’IA attend une personne, qui publie ou refuse définitivement', async () => {
    const { listings, staffListings, reviewer, draft, runReviews, seller, email, staffPushes } = await setup();
    const created = await draft();
    reviewer.answer({ outcome: 'moderation', issues: [{ field: 'photos', message: 'Photo sans rapport.' }] });
    await listings.submit(seller.id, created.id);
    await runReviews();
    expect(staffPushes().at(-1)).toMatchObject({ audience: { permission: 'vendeurs:valider' } });
    await expect(listings.update(seller.id, created.id, { price: 1_000 })).rejects.toMatchObject({ status: 409 });

    const queue = await staffListings.list({ status: 'pending_moderation', page: 1, limit: 20 }, owner);
    expect(queue.items).toMatchObject([{ id: created.id, reviews: [{ source: 'ai', model: 'modele-de-test' }] }]);
    await staffListings.decide(created.id, { decision: 'reject', reason: 'Article interdit à la vente.' }, owner);
    expect(email.last('awa@example.ga')?.text).toContain('Article interdit à la vente.');
    await expect(listings.update(seller.id, created.id, { price: 1_000 })).rejects.toMatchObject({ status: 409 });
    await expect(listings.submit(seller.id, created.id)).rejects.toMatchObject({ status: 409 });
  });

  it('masque une annonce publiée le temps d’un examen, et refuse une décision sur une version dépassée', async () => {
    const { listings, staffListings, draft, runReviews, seller } = await setup();
    const created = await draft();
    await listings.submit(seller.id, created.id);
    await runReviews();
    await staffListings.decide(created.id, { decision: 'hide', reason: 'Signalée comme contrefaçon.' }, owner);
    await expect(listings.publicListing(created.slug)).rejects.toMatchObject({ status: 404 });
    await staffListings.decide(created.id, { decision: 'approve' }, owner);
    await expect(listings.publicListing(created.slug)).resolves.toMatchObject({ slug: created.slug });
    await expect(staffListings.decide(created.id, { decision: 'approve' }, owner)).rejects.toMatchObject({
      status: 409,
    });
    await expect(staffListings.list({ status: 'published', page: 1, limit: 5 }, stockManager)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('une boutique suspendue masque ses annonces', async () => {
    const { listings, staffShops, draft, runReviews, seller, opened } = await setup();
    const created = await draft();
    await listings.submit(seller.id, created.id);
    await runReviews();
    await staffShops.act(opened.id, { action: 'suspend', reason: 'Fraude signalée.' }, owner);
    await expect(listings.publicListing(created.slug)).rejects.toMatchObject({ status: 404 });
  });
});

describe('panne, plafond et signalements', () => {
  it('une panne de l’IA est reprise par la file, puis l’annonce passe en modération', async () => {
    const { listings, listingReviews, reviewer, draft, seller } = await setup();
    const created = await draft();
    await listings.submit(seller.id, created.id);
    reviewer.setUnavailable(true);
    await expect(listingReviews.review(created.id, 1)).rejects.toBeInstanceOf(ReviewUnavailableError);
    await listingReviews.fallbackToModeration(created.id, 1);
    expect(await listings.get(seller.id, created.id)).toMatchObject({
      status: 'pending_moderation',
      lastReview: { reason: 'Vérification automatique indisponible' },
    });
  });

  it('au-delà du plafond mensuel, l’annonce va en modération sans appeler le modèle', async () => {
    const { listings, staffShops, reviewer, draft, runReviews, seller } = await setup();
    await staffShops.updateSettings({ aiReviewMonthlyLimit: 1 }, owner);
    const first = await draft();
    const second = await draft({ title: 'Robe en pagne wax taille L' });
    await listings.submit(seller.id, first.id);
    await runReviews();
    await listings.submit(seller.id, second.id);
    await runReviews();
    expect(reviewer.reviewed).toHaveLength(1);
    expect((await listings.get(seller.id, second.id)).status).toBe('pending_moderation');
  });

  it('un client signale une annonce une fois ; l’équipe classe le signalement', async () => {
    const { listings, staffListings, draft, runReviews, seller } = await setup();
    const created = await draft();
    await listings.submit(seller.id, created.id);
    await runReviews();
    const buyer = randomUUID();
    const report = await listings.report(buyer, created.slug, { reason: 'scam', comment: 'Demande une avance.' });
    await expect(listings.report(buyer, created.slug, { reason: 'scam', comment: '' })).rejects.toMatchObject({
      status: 409,
    });
    await expect(listings.report(seller.id, created.slug, { reason: 'spam', comment: '' })).rejects.toMatchObject({
      status: 422,
    });
    await expect(listings.publicListing(created.slug)).resolves.toMatchObject({ slug: created.slug });
    expect((await staffListings.get(created.id, owner)).openReports).toBe(1);
    await staffListings.decideReport(report.id, 'dismissed', owner);
    await expect(staffListings.decideReport(report.id, 'upheld', owner)).rejects.toMatchObject({ status: 409 });
  });
});
