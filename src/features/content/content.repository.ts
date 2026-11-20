import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export interface BannerRecord {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  image: string;
  accent: 'forest' | 'mure';
  position: number;
  active: boolean;
}
export type BannerChanges = Partial<Omit<BannerRecord, 'id'>>;

export interface AdRecord {
  id: string;
  placement: string;
  advertiser: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  priority: number;
  image: string;
  imageMobile: string | null;
  alt: string;
  href: string;
  active: boolean;
}
export type AdChanges = Partial<Omit<AdRecord, 'id' | 'placement'>>;

export interface OfferRecord {
  id: string;
  label: string;
  title: string;
  productId: string;
  href: string | null;
  position: number;
}

/** Type et non interface : un bloc doit pouvoir s'enregistrer tel quel en JSON. */
export type ArticleBlock = { type: 'p' | 'h2'; text: string };
export type ArticleVersion = {
  at: string;
  by: string;
  event: string;
  title: string;
  excerpt: string;
  content: ArticleBlock[];
  status: 'draft' | 'published';
  publishedAt: string;
};

export interface ArticleContent {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  cover: string;
  content: ArticleBlock[];
  publishedAt: Date;
  readingTime: number;
  status: 'draft' | 'published';
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface ArticleRecord extends ArticleContent {
  id: string;
  history: ArticleVersion[];
}

export type LegalSection = { heading: string; body: string[] };
export interface LegalPageRecord {
  slug: string;
  title: string;
  sections: LegalSection[];
  updatedAt: Date;
}

export type SaveArticleResult = { article: ArticleRecord } | { slugTaken: true } | { notFound: true };

/** Contrat de stockage des contenus éditoriaux. */
export interface ContentRepository {
  banners(onlyActive: boolean): Promise<BannerRecord[]>;
  updateBanner(id: string, changes: BannerChanges): Promise<BannerRecord | null>;
  /** liveAt : seulement les espaces actifs dont la campagne est en cours à cette date */
  ads(filters: { placement?: string | undefined; liveAt?: Date | undefined }): Promise<AdRecord[]>;
  createAd(ad: Omit<AdRecord, 'id'>): Promise<AdRecord>;
  updateAd(id: string, changes: AdChanges): Promise<AdRecord | null>;
  /** Encarts actifs dont le produit est publié */
  offers(): Promise<OfferRecord[]>;
  /** liveAt : seulement les articles publiés à cette date (les programmés attendent) */
  articles(liveAt?: Date): Promise<ArticleRecord[]>;
  articleBySlug(slug: string): Promise<ArticleRecord | null>;
  findArticle(id: string): Promise<ArticleRecord | null>;
  createArticle(content: ArticleContent): Promise<SaveArticleResult>;
  /** Remplace l'article ; la version précédente rejoint l'historique. */
  updateArticle(id: string, content: ArticleContent, version: ArticleVersion): Promise<SaveArticleResult>;
  legalPages(): Promise<LegalPageRecord[]>;
  saveLegalPage(slug: string, page: { title: string; sections: LegalSection[] }): Promise<LegalPageRecord>;
  staffName(id: string): Promise<string | null>;
}

const blocks = z.array(z.object({ type: z.enum(['p', 'h2']), text: z.string() }));
const versions = z.array(
  z.object({
    at: z.string(),
    by: z.string(),
    event: z.string(),
    title: z.string(),
    excerpt: z.string(),
    content: blocks,
    status: z.enum(['draft', 'published']),
    publishedAt: z.string(),
  }),
);
const sections = z.array(z.object({ heading: z.string(), body: z.array(z.string()) }));

type ArticleRow = Prisma.ArticleGetPayload<object>;
// JSON écrit uniquement par ce dépôt : une forme inattendue est une erreur à signaler, pas à masquer
const toArticle = (a: ArticleRow): ArticleRecord => ({
  id: a.id,
  slug: a.slug,
  title: a.title,
  category: a.category,
  excerpt: a.excerpt,
  cover: a.cover,
  content: blocks.parse(a.content),
  publishedAt: a.publishedAt,
  readingTime: a.readingTime,
  status: a.status,
  seoTitle: a.seoTitle,
  seoDescription: a.seoDescription,
  history: versions.parse(a.history),
});

const toLegal = (p: Prisma.LegalPageGetPayload<object>): LegalPageRecord => ({
  slug: p.slug,
  title: p.title,
  sections: sections.parse(p.sections),
  updatedAt: p.updatedAt,
});

const isNotFound = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

/** Mise à jour d'une ligne qui peut avoir disparu : null plutôt qu'une erreur. */
async function orNull<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

const adColumns = {
  id: true,
  placement: true,
  advertiser: true,
  startsAt: true,
  endsAt: true,
  priority: true,
  image: true,
  imageMobile: true,
  alt: true,
  href: true,
  active: true,
} as const;

const bannerColumns = {
  id: true,
  title: true,
  subtitle: true,
  cta: true,
  href: true,
  image: true,
  accent: true,
  position: true,
  active: true,
} as const;

export const contentRepository: ContentRepository = {
  banners: (onlyActive) =>
    prisma.homeBanner.findMany({
      where: onlyActive ? { active: true } : {},
      select: bannerColumns,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    }),

  updateBanner: (id, changes) =>
    orNull(() => prisma.homeBanner.update({ where: { id }, data: changes, select: bannerColumns })),

  ads: ({ placement, liveAt }) =>
    prisma.ad.findMany({
      where: {
        ...(placement ? { placement } : {}),
        ...(liveAt
          ? {
              active: true,
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: liveAt } }] },
                { OR: [{ endsAt: null }, { endsAt: { gt: liveAt } }] },
              ],
            }
          : {}),
      },
      select: adColumns,
      orderBy: [{ placement: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
    }),

  createAd: (data) => prisma.ad.create({ data, select: adColumns }),

  updateAd: (id, changes) => orNull(() => prisma.ad.update({ where: { id }, data: changes, select: adColumns })),

  offers: () =>
    prisma.exclusiveOffer.findMany({
      where: { active: true, product: { status: 'published' } },
      select: { id: true, label: true, title: true, productId: true, href: true, position: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    }),

  articles: async (liveAt) =>
    (
      await prisma.article.findMany({
        where: liveAt ? { status: 'published', publishedAt: { lte: liveAt } } : {},
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      })
    ).map(toArticle),

  articleBySlug: async (slug) => {
    const row = await prisma.article.findUnique({ where: { slug } });
    return row ? toArticle(row) : null;
  },

  findArticle: async (id) => {
    const row = await prisma.article.findUnique({ where: { id } });
    return row ? toArticle(row) : null;
  },

  async createArticle(content) {
    try {
      return { article: toArticle(await prisma.article.create({ data: { ...content, history: [] } })) };
    } catch (error) {
      if (isUniqueViolation(error)) return { slugTaken: true };
      throw error;
    }
  },

  updateArticle: (id, content, version) =>
    prisma.$transaction(async (tx): Promise<SaveArticleResult> => {
      const current = await tx.article.findUnique({ where: { id }, select: { history: true } });
      if (!current) return { notFound: true };
      const history = [...versions.parse(current.history), version];
      try {
        return { article: toArticle(await tx.article.update({ where: { id }, data: { ...content, history } })) };
      } catch (error) {
        if (isUniqueViolation(error)) return { slugTaken: true };
        throw error;
      }
    }),

  legalPages: async () => (await prisma.legalPage.findMany({ orderBy: { slug: 'asc' } })).map(toLegal),

  saveLegalPage: async (slug, page) =>
    toLegal(await prisma.legalPage.upsert({ where: { slug }, create: { slug, ...page }, update: page })),

  staffName: async (id) => {
    const member = await prisma.staffMember.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
    return member ? `${member.firstName} ${member.lastName}` : null;
  },
};
