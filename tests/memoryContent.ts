import { randomUUID } from 'node:crypto';
import type {
  AdRecord,
  ArticleRecord,
  BannerRecord,
  ContentRepository,
  LegalPageRecord,
  OfferRecord,
} from '../src/features/content/content.repository.js';

/** Contenus en mémoire : mêmes règles que la base (adresse d'article unique, campagnes filtrées par date). */
export function createMemoryContent(now: () => Date) {
  const banners: BannerRecord[] = [];
  const ads: AdRecord[] = [];
  const offers: OfferRecord[] = [];
  const articles: ArticleRecord[] = [];
  const legalPages: LegalPageRecord[] = [];
  const copy = <T>(value: T): T => structuredClone(value);

  const repository: ContentRepository = {
    banners: async (onlyActive) =>
      banners
        .filter((b) => !onlyActive || b.active)
        .sort((a, b) => a.position - b.position)
        .map(copy),
    async updateBanner(id, changes) {
      const banner = banners.find((b) => b.id === id);
      return banner ? copy(Object.assign(banner, changes)) : null;
    },
    ads: async ({ placement, liveAt }) =>
      ads
        .filter(
          (a) =>
            (!placement || a.placement === placement) &&
            (!liveAt || (a.active && (!a.startsAt || a.startsAt <= liveAt) && (!a.endsAt || a.endsAt > liveAt))),
        )
        .sort((a, b) => b.priority - a.priority)
        .map(copy),
    async createAd(data) {
      const ad = { ...copy(data), id: randomUUID() };
      ads.push(ad);
      return copy(ad);
    },
    async updateAd(id, changes) {
      const ad = ads.find((a) => a.id === id);
      return ad ? copy(Object.assign(ad, changes)) : null;
    },
    offers: async () => offers.map(copy),
    articles: async (liveAt) =>
      articles
        .filter((a) => !liveAt || (a.status === 'published' && a.publishedAt <= liveAt))
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .map(copy),
    articleBySlug: async (slug) => {
      const a = articles.find((x) => x.slug === slug);
      return a ? copy(a) : null;
    },
    findArticle: async (id) => {
      const a = articles.find((x) => x.id === id);
      return a ? copy(a) : null;
    },
    async createArticle(content) {
      if (articles.some((a) => a.slug === content.slug)) return { slugTaken: true };
      const article = { ...copy(content), id: randomUUID(), history: [] };
      articles.push(article);
      return { article: copy(article) };
    },
    async updateArticle(id, content, version) {
      const article = articles.find((a) => a.id === id);
      if (!article) return { notFound: true };
      if (articles.some((a) => a.slug === content.slug && a.id !== id)) return { slugTaken: true };
      Object.assign(article, copy(content));
      article.history.push(version);
      return { article: copy(article) };
    },
    legalPages: async () => legalPages.map(copy),
    async saveLegalPage(slug, page) {
      const existing = legalPages.find((p) => p.slug === slug);
      const saved = { slug, ...copy(page), updatedAt: now() };
      if (existing) Object.assign(existing, saved);
      else legalPages.push(saved);
      return copy(saved);
    },
    staffName: async () => null,
  };
  return { repository, banners, ads, offers, articles, legalPages };
}
