import { ForbiddenError, NotFoundError } from '../../core/errors/AppError.js';
import { can, type Grantee, type Permission } from '../../core/security/permissions.js';
import type {
  AdRecord,
  ContentRepository,
  LegalPageRecord,
} from './content.repository.js';
import type {
  CreateAdInput,
  LegalPageInput,
  UpdateAdInput,
  UpdateBannerInput,
} from './content.schemas.js';

export const toAdDto = (a: AdRecord) => a;

export const toLegalPageDto = (p: LegalPageRecord) => ({
  slug: p.slug,
  title: p.title,
  sections: p.sections,
  updatedAt: p.updatedAt.toISOString(),
});

/**
 * Contenus du site : bannières, espaces publicitaires, offres exclusives et pages légales.
 * Lecture catalogue:consulter ; modifications catalogue:modifier ; publication catalogue:publier.
 */
export const createContentService = (deps: { content: ContentRepository }) => {
  const { content } = deps;

  function require(actor: Grantee, permission: Permission) {
    if (!can(actor, permission)) throw new ForbiddenError();
  }

  return {
    banners: () => content.banners(true),
    ads: async (placement: string | undefined) => (await content.ads({ placement, activeOnly: true })).map(toAdDto),
    offers: () => content.offers(),
    legalPages: async () => (await content.legalPages()).map(toLegalPageDto),

    async staffBanners(actor: Grantee) {
      require(actor, 'catalogue:consulter');
      return content.banners(false);
    },

    async updateBanner(id: string, input: UpdateBannerInput, actor: Grantee) {
      require(actor, 'catalogue:modifier');
      const updated = await content.updateBanner(id, input);
      if (!updated) throw new NotFoundError('Bannière introuvable.');
      return updated;
    },

    async staffAds(actor: Grantee) {
      require(actor, 'catalogue:consulter');
      return (await content.ads({})).map(toAdDto);
    },

    async createAd(input: CreateAdInput, actor: Grantee) {
      require(actor, 'catalogue:modifier');
      return toAdDto(await content.createAd(input));
    },

    async updateAd(id: string, input: UpdateAdInput, actor: Grantee) {
      require(actor, 'catalogue:modifier');
      const current = (await content.ads({})).find((a) => a.id === id);
      if (!current) throw new NotFoundError('Espace publicitaire introuvable.');
      const updated = await content.updateAd(id, input);
      if (!updated) throw new NotFoundError('Espace publicitaire introuvable.');
      return toAdDto(updated);
    },

    async staffLegalPages(actor: Grantee) {
      require(actor, 'catalogue:consulter');
      return (await content.legalPages()).map(toLegalPageDto);
    },

    async saveLegalPage(slug: string, input: LegalPageInput, actor: Grantee) {
      require(actor, 'catalogue:publier');
      return toLegalPageDto(await content.saveLegalPage(slug, input));
    },
  };
};

export type ContentService = ReturnType<typeof createContentService>;
