import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock } from '../../../tests/factories.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const buyer = { latitude: 0.3912, longitude: 9.4531 };
const page = { page: 1, limit: 20 };

/** Trois boutiques : en ville, à Owendo, et une sans position (classée au niveau du quartier). */
async function setup() {
  const clock = createClock();
  const shop = buildShopServices(clock);
  const mode = shop.catalog.addCategory({ slug: 'mode', name: 'Mode' });
  const robes = shop.catalog.addCategory({ slug: 'robes', name: 'Robes', parentId: mode.id });
  const maison = shop.catalog.addCategory({ slug: 'maison', name: 'Maison' });
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
  const openShop = async (name: string, district: string, position: { latitude: number; longitude: number } | null) => {
    const seller = shop.shopsStore.addOwner();
    const opened = await shop.shops.open(seller.id, {
      name,
      description: '',
      city: district === 'Owendo' ? 'Owendo' : 'Libreville',
      district,
      position,
      phone: '077123456',
      acceptedPaymentMethods: ['cash', 'airtel'],
      handoverModes: ['pickup'],
      planId: plan.id,
    });
    return { seller, opened };
  };
  const centre = await openShop('Boutique du centre', 'Louis', { latitude: 0.3905, longitude: 9.4542 });
  const owendo = await openShop('Boutique d’Owendo', 'Owendo', { latitude: 0.2918, longitude: 9.5047 });
  const unknown = await openShop('Boutique sans position', 'Nzeng-Ayong', null);

  /** Publie une annonce : brouillon, soumission, avis favorable. */
  const publish = async (
    seller: { id: string },
    fields: { title: string; categoryId: string; price: number; condition?: 'new' | 'like_new' | 'good' | 'used' },
  ) => {
    const draft = await shop.listings.create(seller.id, {
      title: fields.title,
      description: `${fields.title}, en bon état, à retirer sur place.`,
      categoryId: fields.categoryId,
      kind: 'product',
      condition: fields.condition ?? 'good',
      price: fields.price,
      quantity: 1,
      photos: ['https://medias.test/listings/photo.webp'],
      minPrice: null,
      sellerNotes: '',
    });
    await shop.listings.submit(seller.id, draft.id);
    for (const job of shop.pushQueue.jobs.splice(0))
      if (job.name === 'listings.review' && 'version' in job.data)
        await shop.listingReviews.review(job.data.listingId, job.data.version);
    clock.advance(60_000);
    return draft;
  };
  const robeCentre = await publish(centre.seller, { title: 'Robe wax du centre', categoryId: robes.id, price: 20_000 });
  const robeOwendo = await publish(owendo.seller, {
    title: 'Robe de soirée Owendo',
    categoryId: robes.id,
    price: 45_000,
    condition: 'new',
  });
  const tableQuartier = await publish(unknown.seller, { title: 'Table basse', categoryId: maison.id, price: 15_000 });
  return { ...shop, centre, owendo, unknown, robeCentre, robeOwendo, tableQuartier };
}

const titles = (result: { items: Array<{ title: string }> }) => result.items.map((i) => i.title);

describe('recherche des annonces', () => {
  it('sans position : les plus récentes d’abord, sans distance', async () => {
    const { listings } = await setup();
    const result = await listings.search(page);
    expect(titles(result)).toEqual(['Table basse', 'Robe de soirée Owendo', 'Robe wax du centre']);
    expect(result.items.every((i) => i.distanceKm === null)).toBe(true);
    expect(result).toMatchObject({ total: 3, hasNext: false });
  });

  it('avec position : les plus proches d’abord, distance arrondie, boutique sans position en dernier', async () => {
    const { listings } = await setup();
    const result = await listings.search({ ...page, position: buyer });
    expect(titles(result)).toEqual(['Robe wax du centre', 'Robe de soirée Owendo', 'Table basse']);
    expect(result.items.map((i) => i.distanceKm)).toEqual([1, 12, null]);
    expect(JSON.stringify(result)).not.toMatch(/9\.45|0\.39|latitude/);
  });

  it('un rayon écarte les annonces lointaines et celles dont la boutique n’a pas de position', async () => {
    const { listings } = await setup();
    const result = await listings.search({ ...page, position: buyer, maxKm: 5 });
    expect(titles(result)).toEqual(['Robe wax du centre']);
  });

  it('filtre par catégorie (sous-catégories comprises), état, prix, ville et mots', async () => {
    const { listings } = await setup();
    expect(titles(await listings.search({ ...page, category: 'mode' }))).toHaveLength(2);
    expect(titles(await listings.search({ ...page, condition: ['new'] }))).toEqual(['Robe de soirée Owendo']);
    expect(titles(await listings.search({ ...page, minPrice: 16_000, maxPrice: 30_000 }))).toEqual([
      'Robe wax du centre',
    ]);
    expect(titles(await listings.search({ ...page, city: 'owendo' }))).toEqual(['Robe de soirée Owendo']);
    // Pertinence : le titre qui commence par les mots cherchés passe devant
    expect(titles(await listings.search({ ...page, search: 'robe' }))).toEqual([
      'Robe de soirée Owendo',
      'Robe wax du centre',
    ]);
    await expect(listings.search({ ...page, minPrice: 50_000, maxPrice: 10_000 })).rejects.toMatchObject({
      status: 422,
    });
  });

  it('n’affiche ni brouillon ni annonce d’une boutique suspendue', async () => {
    const { listings, staffShops, centre, robeCentre } = await setup();
    await listings.create(centre.seller.id, {
      title: 'Brouillon non soumis',
      description: 'Un brouillon qui ne doit jamais apparaître.',
      categoryId: robeCentre.category.id,
      kind: 'service',
      condition: null,
      price: 1_000,
      quantity: null,
      photos: [],
      minPrice: null,
      sellerNotes: '',
    });
    await staffShops.act(centre.opened.id, { action: 'suspend', reason: 'Fraude signalée.' }, owner);
    expect(titles(await listings.search(page))).toEqual(['Table basse', 'Robe de soirée Owendo']);
  });
});
