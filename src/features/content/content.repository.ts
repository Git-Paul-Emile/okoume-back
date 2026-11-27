import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export interface AdRecord {
  id: string;
  placement: string;
  advertiser: string | null;
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

export type LegalSection = { heading: string; body: string[] };
export interface LegalPageRecord {
  slug: string;
  title: string;
  sections: LegalSection[];
  updatedAt: Date;
}

/** Contrat de stockage des contenus du site. */
export interface ContentRepository {
  /** liveAt : seulement les espaces actifs dont la campagne est en cours à cette date */
  ads(filters: { placement?: string | undefined; activeOnly?: boolean | undefined }): Promise<AdRecord[]>;
  createAd(ad: Omit<AdRecord, 'id'>): Promise<AdRecord>;
  updateAd(id: string, changes: AdChanges): Promise<AdRecord | null>;
  /** Encarts actifs dont le produit est publié */
  offers(): Promise<OfferRecord[]>;
  legalPages(): Promise<LegalPageRecord[]>;
  saveLegalPage(slug: string, page: { title: string; sections: LegalSection[] }): Promise<LegalPageRecord>;
  staffName(id: string): Promise<string | null>;
}

const sections = z.array(z.object({ heading: z.string(), body: z.array(z.string()) }));

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
  priority: true,
  image: true,
  imageMobile: true,
  alt: true,
  href: true,
  active: true,
} as const;

export const contentRepository: ContentRepository = {
  ads: ({ placement, activeOnly }) =>
    prisma.ad.findMany({
      where: {
        ...(placement ? { placement } : {}),
        ...(activeOnly ? { active: true } : {}),
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

  legalPages: async () => (await prisma.legalPage.findMany({ orderBy: { slug: 'asc' } })).map(toLegal),

  saveLegalPage: async (slug, page) =>
    toLegal(await prisma.legalPage.upsert({ where: { slug }, create: { slug, ...page }, update: page })),

  staffName: async (id) => {
    const member = await prisma.staffMember.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
    return member ? `${member.firstName} ${member.lastName}` : null;
  },
};
