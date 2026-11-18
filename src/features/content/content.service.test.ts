import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../tests/factories.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const catalog = { id: 's1', role: 'catalog_manager' as const, extraRoles: [], customPermissions: [] };
const stock = { id: 's2', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };
const DAY = 24 * 60 * 60_000;

const article = (overrides: Record<string, unknown> = {}) => ({
  slug: 'payer-par-mobile-money',
  title: 'Payer par Mobile Money',
  category: 'Guide d’achat',
  excerpt: 'Les étapes pour régler votre commande.',
  cover: 'https://medias.test/banners/cover.jpg',
  content: [{ type: 'p' as const, text: 'Choisissez Airtel Money ou Moov Money.' }],
  publishedAt: new Date('2026-11-01T08:00:00.000Z'),
  readingTime: 3,
  status: 'published' as const,
  seo: null,
  ...overrides,
});

const setup = () => buildApp().services;

describe('articles', () => {
  it('cache un article programmé jusqu’à sa date de publication', async () => {
    const { content, clock } = setup();
    await content.createArticle(
      article({ slug: 'a-venir', publishedAt: new Date(clock.now().getTime() + DAY) }),
      owner,
    );
    await expect(content.article('a-venir')).rejects.toMatchObject({ status: 404 });
    expect(await content.articles()).toHaveLength(0);
    clock.advance(2 * DAY);
    expect((await content.article('a-venir')).title).toBe('Payer par Mobile Money');
  });

  it('garde la version précédente et nomme le changement de statut', async () => {
    const { content } = setup();
    const created = await content.createArticle(article(), owner);
    const unpublished = await content.updateArticle(created.id, article({ status: 'draft' }), owner);
    expect(unpublished.history.at(-1)).toMatchObject({ event: 'Dépublication', status: 'published' });
    await expect(content.createArticle(article(), owner)).rejects.toMatchObject({ status: 409 });
  });

  it('réserve la mise en ligne au droit de publier', async () => {
    const { content } = setup();
    await expect(content.createArticle(article(), stock)).rejects.toMatchObject({ status: 403 });
    await expect(content.createArticle(article({ status: 'draft' }), catalog)).resolves.toMatchObject({
      status: 'draft',
    });
  });
});

describe('espaces publicitaires', () => {
  it('ne montre une campagne que pendant ses dates et refuse une fin avant le début', async () => {
    const { content, contentStore, clock } = setup();
    const now = clock.now();
    contentStore.ads.push({
      id: 'a1',
      placement: 'home-promo',
      advertiser: 'Gabon Telecom',
      startsAt: new Date(now.getTime() + DAY),
      endsAt: new Date(now.getTime() + 10 * DAY),
      priority: 5,
      image: '/ads/a.svg',
      imageMobile: null,
      alt: 'Offre de rentrée',
      href: 'https://exemple.ga',
      active: true,
    });
    expect(await content.ads('home-promo')).toHaveLength(0);
    clock.advance(2 * DAY);
    expect(await content.ads('home-promo')).toHaveLength(1);
    await expect(content.updateAd('a1', { endsAt: new Date(now.getTime() - DAY) }, owner)).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe('pages légales', () => {
  it('enregistre une page modifiée, réservée au droit de publier', async () => {
    const { content } = setup();
    const page = { title: 'Conditions générales de vente', sections: [{ heading: 'Objet', body: ['Texte.'] }] };
    await expect(content.saveLegalPage('cgv', page, stock)).rejects.toMatchObject({ status: 403 });
    await content.saveLegalPage('cgv', page, owner);
    expect(await content.legalPages()).toEqual([expect.objectContaining({ slug: 'cgv', title: page.title })]);
  });
});
