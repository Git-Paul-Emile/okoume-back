import { randomUUID } from 'node:crypto';
import type {
  AdRecord,
  BannerRecord,
  ContentRepository,
  LegalPageRecord,
  OfferRecord,
} from '../src/features/content/content.repository.js';

/** Contenus en mémoire : mêmes règles que la base (publicités actives). */
export function createMemoryContent(now: () => Date) {
  const banners: BannerRecord[] = [];
  const ads: AdRecord[] = [];
  const offers: OfferRecord[] = [];
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
    ads: async ({ placement, activeOnly }) =>
      ads
        .filter(
          (a) =>
            (!placement || a.placement === placement) &&
            (!activeOnly || a.active),
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
  return { repository, banners, ads, offers, legalPages };
}
