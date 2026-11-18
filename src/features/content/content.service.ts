import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { can, type Grantee, type Permission } from '../../core/security/permissions.js';
import type {
  AdRecord,
  ArticleContent,
  ArticleRecord,
  ContentRepository,
  LegalPageRecord,
  SaveArticleResult,
} from './content.repository.js';
import type { ArticleInput, LegalPageInput, UpdateAdInput, UpdateBannerInput } from './content.schemas.js';

export const toAdDto = (a: AdRecord) => ({
  ...a,
  startsAt: a.startsAt?.toISOString() ?? null,
  endsAt: a.endsAt?.toISOString() ?? null,
});

/** Vue publique : sans l'historique des versions. */
export const toArticleDto = (a: ArticleRecord) => ({
  id: a.id,
  slug: a.slug,
  title: a.title,
  category: a.category,
  excerpt: a.excerpt,
  cover: a.cover,
  content: a.content,
  publishedAt: a.publishedAt.toISOString(),
  readingTime: a.readingTime,
  status: a.status,
  seo: a.seoTitle || a.seoDescription ? { title: a.seoTitle ?? '', description: a.seoDescription ?? '' } : null,
});

export const toStaffArticleDto = (a: ArticleRecord) => ({ ...toArticleDto(a), history: a.history });

export const toLegalPageDto = (p: LegalPageRecord) => ({
  slug: p.slug,
  title: p.title,
  sections: p.sections,
  updatedAt: p.updatedAt.toISOString(),
});

const toContent = (input: ArticleInput): ArticleContent => ({
  slug: input.slug,
  title: input.title,
  category: input.category,
  excerpt: input.excerpt,
  cover: input.cover,
  content: input.content,
  publishedAt: input.publishedAt,
  readingTime: input.readingTime,
  status: input.status,
  seoTitle: input.seo?.title || null,
  seoDescription: input.seo?.description || null,
});

/**
 * Contenus du site : bannières et espaces publicitaires de l'accueil (3.1, 3.7), offres exclusives, articles
 * (3.6) et pages légales. Lecture catalogue:consulter ; modifications catalogue:modifier ; mettre un article
 * en ligne ou le retirer, catalogue:publier.
 */
export const createContentService = (deps: { content: ContentRepository; now: () => Date }) => {
  const { content, now } = deps;

  function require(actor: Grantee, permission: Permission) {
    if (!can(actor, permission)) throw new ForbiddenError();
  }

  function saved(result: SaveArticleResult) {
    if ('notFound' in result) throw new NotFoundError('Article introuvable.');
    if ('slugTaken' in result) throw new ConflictError('Cette adresse est déjà utilisée par un autre article.');
    return toStaffArticleDto(result.article);
  }

  function checkCampaign(startsAt: Date | null | undefined, endsAt: Date | null | undefined) {
    if (startsAt && endsAt && endsAt <= startsAt) throw new UnprocessableError('La fin doit être après le début.');
  }

  return {
    banners: () => content.banners(true),
    ads: async (placement: string | undefined) => (await content.ads({ placement, liveAt: now() })).map(toAdDto),
    offers: () => content.offers(),
    articles: async () => (await content.articles(now())).map(toArticleDto),

    /** Un article programmé ou en brouillon n'existe pas encore pour le public. */
    async article(slug: string) {
      const article = await content.articleBySlug(slug);
      if (!article || article.status !== 'published' || article.publishedAt > now())
        throw new NotFoundError('Article introuvable.');
      return toArticleDto(article);
    },

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

    async updateAd(id: string, input: UpdateAdInput, actor: Grantee) {
      require(actor, 'catalogue:modifier');
      const current = (await content.ads({})).find((a) => a.id === id);
      if (!current) throw new NotFoundError('Espace publicitaire introuvable.');
      checkCampaign(
        input.startsAt === undefined ? current.startsAt : input.startsAt,
        input.endsAt === undefined ? current.endsAt : input.endsAt,
      );
      const updated = await content.updateAd(id, input);
      if (!updated) throw new NotFoundError('Espace publicitaire introuvable.');
      return toAdDto(updated);
    },

    async staffArticles(actor: Grantee) {
      require(actor, 'catalogue:consulter');
      return (await content.articles()).map(toStaffArticleDto);
    },

    async createArticle(input: ArticleInput, actor: Grantee) {
      require(actor, input.status === 'published' ? 'catalogue:publier' : 'catalogue:modifier');
      return saved(await content.createArticle(toContent(input)));
    },

    /** Chaque enregistrement garde la version précédente, avec son auteur et la nature du changement. */
    async updateArticle(id: string, input: ArticleInput, actor: Grantee & { id: string }) {
      const previous = await content.findArticle(id);
      if (!previous) throw new NotFoundError('Article introuvable.');
      const statusChange = previous.status !== input.status;
      require(actor, statusChange || input.status === 'published' ? 'catalogue:publier' : 'catalogue:modifier');
      const event = !statusChange ? 'Modification' : input.status === 'published' ? 'Publication' : 'Dépublication';
      return saved(
        await content.updateArticle(id, toContent(input), {
          at: now().toISOString(),
          by: (await content.staffName(actor.id)) ?? 'Équipe',
          event,
          title: previous.title,
          excerpt: previous.excerpt,
          content: previous.content,
          status: previous.status,
          publishedAt: previous.publishedAt.toISOString(),
        }),
      );
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
