import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp, buildShopServices, createClock } from '../../../tests/factories.js';
import { librevilleDay } from './seller-dashboard.rules.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const DAY = 24 * 60 * 60 * 1000;

async function setup(clock = createClock(), shop = buildShopServices(clock)) {
  const category = shop.catalog.addCategory({ slug: 'mode', name: 'Mode' });
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
  const seller = shop.shopsStore.addOwner();
  await shop.shops.open(seller.id, {
    name: 'Atelier Wax',
    description: '',
    city: 'Libreville',
    district: 'Louis',
    position: null,
    phone: '066778899',
    acceptedPaymentMethods: ['cash'],
    handoverModes: ['pickup'],
    planId: plan.id,
  });
  const create = (title: string) =>
    shop.listings.create(seller.id, {
      title,
      description: 'Robe cousue main en pagne wax, taille M, jamais portée.',
      categoryId: category.id,
      kind: 'product',
      condition: 'new',
      price: 25_000,
      quantity: 2,
      photos: ['https://medias.test/listings/robe.webp'],
      minPrice: null,
      sellerNotes: '',
    });
  const publish = async (title: string) => {
    const draft = await create(title);
    await shop.listings.submit(seller.id, draft.id);
    for (const job of shop.pushQueue.jobs.splice(0))
      if (job.name === 'listings.review' && 'version' in job.data)
        await shop.listingReviews.review(job.data.listingId, job.data.version);
    return draft;
  };
  return { ...shop, clock, seller, create, publish };
}

describe('espace vendeur', () => {
  it('compte les visites de la fiche publique, sauf celles du vendeur', async () => {
    const { listings, sellerDashboard, seller, publish, shopsStore } = await setup();
    const robe = await publish('Robe wax Atelier');
    const buyer = shopsStore.addOwner();
    await listings.publicListing(robe.slug, buyer.id);
    await listings.publicListing(robe.slug, buyer.id);
    await listings.publicListing(robe.slug);
    await listings.publicListing(robe.slug, seller.id);
    const stats = await sellerDashboard.listingStats(seller.id, robe.id);
    expect(stats.total).toBe(3);
    expect(stats.daily).toHaveLength(30);
    expect(stats.daily.at(-1)?.views).toBe(3);
  });

  it('répartit les visites jour par jour, à l’heure de Libreville', async () => {
    const { listings, sellerDashboard, seller, publish, clock } = await setup();
    const robe = await publish('Robe wax Atelier');
    await listings.publicListing(robe.slug);
    clock.advance(DAY);
    await listings.publicListing(robe.slug);
    await listings.publicListing(robe.slug);
    const { daily } = await sellerDashboard.listingStats(seller.id, robe.id);
    expect(daily.slice(-2).map((d) => d.views)).toEqual([1, 2]);
    // 23 h 30 UTC, c'est déjà le lendemain à Libreville (UTC+1)
    expect(librevilleDay(new Date('2026-11-12T23:30:00.000Z')).toISOString()).toBe('2026-11-13T00:00:00.000Z');
  });

  it('résume la boutique : accès, annonces par état, demandes et questions en attente, annonces les plus vues', async () => {
    const {
      listings,
      sellerDashboard,
      listingRequests,
      chat,
      chatAssistant,
      chatReplies,
      seller,
      publish,
      create,
      shopsStore,
      pushQueue,
    } = await setup();
    const robe = await publish('Robe wax Atelier');
    await create('Brouillon de chemise');
    await listings.publicListing(robe.slug);
    const buyer = shopsStore.addOwner();
    await listingRequests.create(buyer.id, {
      listingSlug: robe.slug,
      quantity: 1,
      paymentMethod: 'cash',
      handover: 'pickup',
      contactPhone: '077123456',
      message: '',
    });
    const { conversation } = await chat.open(buyer.id, robe.slug);
    const sent = await chat.send(buyer.id, conversation.id, 'Elle taille grand ?');
    chatAssistant.answer({ intent: 'needs_seller', reply: '', buyerOffer: null });
    pushQueue.jobs.splice(0);
    await chatReplies.reply(conversation.id, sent.id);

    const overview = await sellerDashboard.overview(seller.id);
    expect(overview).toMatchObject({
      shop: { name: 'Atelier Wax', access: { state: 'active', visible: true } },
      listings: { published: 1, draft: 1 },
      requests: { awaitingAnswer: 1, accepted: 0 },
      conversations: { awaitingSeller: 1 },
      views: { total: 1, topListings: [{ slug: robe.slug, views: 1 }] },
    });
  });

  it('protège les chiffres des autres boutiques', async () => {
    const { sellerDashboard, publish, shopsStore } = await setup();
    const robe = await publish('Robe wax Atelier');
    const stranger = shopsStore.addOwner();
    await expect(sellerDashboard.listingStats(stranger.id, robe.id)).rejects.toMatchObject({ status: 404 });
    await expect(sellerDashboard.overview(stranger.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('partage manuel', () => {
  it('donne le lien, un texte prêt à envoyer et les liens WhatsApp et Facebook, pour une annonce publiée', async () => {
    const { listings, seller, publish, create } = await setup();
    const robe = await publish('Robe wax Atelier');
    const share = await listings.share(seller.id, robe.id);
    expect(share).toMatchObject({
      url: `http://localhost:5173/annonces/${robe.slug}`,
      link: `http://localhost:3000/partage/annonces/${robe.slug}`,
      text: 'Robe wax Atelier : 25 000 FCFA sur Okoumé',
    });
    expect(share.whatsapp).toBe(`https://wa.me/?text=${encodeURIComponent(`${share.text} ${share.link}`)}`);
    expect(share.facebook).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(share.link)}`);
    const draft = await create('Brouillon de chemise');
    await expect(listings.share(seller.id, draft.id)).rejects.toMatchObject({ status: 409 });
  });

  it('sert une page d’aperçu pour les réseaux, valeurs échappées, puis redirige vers le site', async () => {
    const app = buildApp();
    const { publish } = await setup(app.services.clock, app.services);
    const robe = await publish('Robe <b>wax</b> & "chic"');
    const res = await request(app).get(`/partage/annonces/${robe.slug}`).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain(
      '<meta property="og:title" content="Robe &lt;b&gt;wax&lt;/b&gt; &amp; &quot;chic&quot; : 25',
    );
    expect(res.text).toContain('<meta property="og:image" content="https://medias.test/listings/robe.webp">');
    expect(res.text).toContain(
      `<meta http-equiv="refresh" content="0; url=http://localhost:5173/annonces/${robe.slug}">`,
    );
    expect(res.text).not.toContain('<b>wax</b>');
    await request(app).get('/partage/annonces/annonce-inconnue').expect(404);
  });
});
