import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { ISSUE_FIELDS, type ReviewIssue } from '../../infrastructure/ai/listingReviewer.js';
import { escapeLike } from '../../core/text/escapeLike.js';
import { prisma } from '../../lib/prisma.js';
import { addDays } from '../shops/shops.rules.js';
import { boundingBox, type Position } from './listings.rules.js';

export type ListingStatus =
  'draft' | 'in_review' | 'changes_requested' | 'pending_moderation' | 'published' | 'rejected' | 'withdrawn' | 'sold';
export type ListingCondition = 'new' | 'like_new' | 'good' | 'used';

export interface ListingRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: { id: string; label: string };
  kind: 'product' | 'service';
  condition: ListingCondition | null;
  price: number;
  quantity: number | null;
  city: string;
  district: string;
  status: ListingStatus;
  version: number;
  submittedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  photos: string[];
  /** Prix minimum de négociation (32.5) ; jamais public, jamais transmis au modèle */
  minPrice: number | null;
  /** Consignes du vendeur pour le tchat ; jamais publiques */
  sellerNotes: string;
  shop: {
    id: string;
    slug: string;
    name: string;
    ownerId: string;
    verified: boolean;
    status: 'active' | 'suspended';
    planKind: 'free' | 'paid';
    accessEndsAt: Date | null;
    inTrial: boolean;
  };
}

/** Champs que le vendeur renseigne. */
export interface ListingFields {
  title: string;
  description: string;
  categoryId: string;
  kind: 'product' | 'service';
  condition: ListingCondition | null;
  price: number;
  quantity: number | null;
  city: string;
  district: string;
  photos: string[];
  /** Prix minimum de négociation (32.5) ; jamais public, jamais transmis au modèle */
  minPrice: number | null;
  /** Consignes du vendeur pour le tchat ; jamais publiques */
  sellerNotes: string;
}

export interface ReviewRecord {
  id: string;
  version: number;
  source: 'ai' | 'staff';
  outcome: 'approved' | 'changes_requested' | 'moderation' | 'rejected';
  issues: ReviewIssue[];
  reason: string | null;
  model: string | null;
  createdAt: Date;
}

export type NewReview = Omit<ReviewRecord, 'id' | 'createdAt' | 'version'> & { staffId: string | null };

export type ReportReason =
  'prohibited' | 'scam' | 'misleading' | 'offensive' | 'personal_data' | 'inappropriate_photos' | 'spam' | 'other';

export interface ReportRecord {
  id: string;
  listing: { id: string; slug: string; title: string; shopName: string };
  reason: ReportReason;
  comment: string;
  status: 'open' | 'dismissed' | 'upheld';
  decidedAt: Date | null;
  createdAt: Date;
}

export interface ListingsQuery {
  shopId?: string | undefined;
  statuses?: ListingStatus[] | undefined;
  /** Annonces visibles du public à cette date : publiées, boutique active et accès en cours ou en grâce */
  visibleAt?: { now: Date; graceDays: number } | undefined;
  page: number;
  limit: number;
}

export type ListingSort = 'relevance' | 'distance' | '-publishedAt' | 'price' | '-price';

/** Critères de la recherche publique (32.4) ; seules les annonces visibles du public sont retenues. */
export interface ListingSearch {
  search?: string | undefined;
  categorySlug?: string | undefined;
  kind?: 'product' | 'service' | undefined;
  conditions?: ListingCondition[] | undefined;
  city?: string | undefined;
  district?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  /** Position déjà arrondie de l'acheteur : jamais conservée, elle ne sert qu'au calcul */
  near?: Position | undefined;
  /** Rayon en kilomètres ; exige near. Une boutique sans position n'y figure pas */
  maxKm?: number | undefined;
  sort: ListingSort;
  visibleAt: { now: Date; graceDays: number };
  page: number;
  limit: number;
}

export interface SearchHit {
  id: string;
  /** Distance exacte en kilomètres, null sans position de l'acheteur ou de la boutique */
  distanceKm: number | null;
  /** Mise en avant payante en cours (32.10) : l'annonce est marquée « Sponsorisé » */
  sponsored: boolean;
}

/** Contrat des annonces des vendeurs tiers, de leur historique de vérification et de leurs signalements (32.3). */
export interface ListingsRepository {
  categoryLabel(categoryId: string): Promise<{ label: string; isCollection: boolean } | null>;
  create(listing: ListingFields & { shopId: string; slug: string }): Promise<ListingRecord | 'slug_taken'>;
  findById(id: string): Promise<ListingRecord | null>;
  findBySlug(slug: string): Promise<ListingRecord | null>;
  list(query: ListingsQuery): Promise<{ items: ListingRecord[]; total: number }>;
  search(criteria: ListingSearch): Promise<{ hits: SearchHit[]; total: number }>;
  /** Annonces dans l'ordre des identifiants donnés (ordre de la recherche). */
  findByIds(ids: string[]): Promise<ListingRecord[]>;
  /** Remplace les champs envoyés ; les photos sont remplacées en entier quand elles sont envoyées. */
  update(id: string, fields: Partial<ListingFields>): Promise<ListingRecord>;
  /** Soumission à la vérification depuis l'un des états attendus : nouvelle version, ou null si l'état a changé. */
  submit(id: string, from: ListingStatus[], at: Date): Promise<number | null>;
  /**
   * Enregistre une revue et applique son effet, dans une transaction, seulement si l'annonce est toujours à la
   * version et dans l'un des états attendus. false : l'annonce a changé entre-temps, rien n'est écrit.
   */
  applyReview(
    id: string,
    expected: { version: number; statuses: ListingStatus[] },
    review: NewReview,
    next: ListingStatus,
    at: Date,
  ): Promise<boolean>;
  setStatus(id: string, from: ListingStatus[], to: ListingStatus): Promise<boolean>;
  reviews(listingId: string): Promise<ReviewRecord[]>;
  /** Vérifications ayant appelé un modèle depuis cette date, pour le plafond mensuel (16.6). */
  aiReviewCount(since: Date): Promise<number>;

  createReport(report: {
    listingId: string;
    reporterId: string;
    reason: ReportReason;
    comment: string;
  }): Promise<ReportRecord | 'already_open'>;
  listReports(query: {
    status?: ReportRecord['status'] | undefined;
    listingId?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ items: ReportRecord[]; total: number }>;
  decideReport(
    id: string,
    decision: { status: 'dismissed' | 'upheld'; staffId: string; at: Date },
  ): Promise<ReportRecord | 'stale' | null>;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Les points relevés sont relus et validés : une ligne inattendue en base ne passe pas en silence. */
const issuesSchema = z.array(z.object({ field: z.enum(ISSUE_FIELDS), message: z.string() }));

const listingInclude = {
  category: { select: { id: true, name: true, fullName: true } },
  photos: { select: { url: true }, orderBy: { position: 'asc' } },
  shop: {
    select: {
      id: true,
      slug: true,
      name: true,
      ownerId: true,
      verifiedAt: true,
      status: true,
      accessEndsAt: true,
      inTrial: true,
      plan: { select: { kind: true } },
    },
  },
} as const satisfies Prisma.ListingInclude;
type ListingRow = Prisma.ListingGetPayload<{ include: typeof listingInclude }>;

const toListing = ({
  category,
  photos,
  shop,
  categoryId: _categoryId,
  shopId: _shopId,
  updatedAt: _updatedAt,
  price,
  minPrice,
  ...listing
}: ListingRow): ListingRecord => ({
  ...listing,
  price: price.toNumber(),
  minPrice: minPrice?.toNumber() ?? null,
  category: { id: category.id, label: category.fullName ?? category.name },
  photos: photos.map((p) => p.url),
  shop: {
    id: shop.id,
    slug: shop.slug,
    name: shop.name,
    ownerId: shop.ownerId,
    verified: shop.verifiedAt !== null,
    status: shop.status,
    planKind: shop.plan.kind,
    accessEndsAt: shop.accessEndsAt,
    inTrial: shop.inTrial,
  },
});

const reportInclude = {
  listing: { select: { id: true, slug: true, title: true, shop: { select: { name: true } } } },
} as const satisfies Prisma.ListingReportInclude;
type ReportRow = Prisma.ListingReportGetPayload<{ include: typeof reportInclude }>;

const toReport = (row: ReportRow): ReportRecord => ({
  id: row.id,
  listing: { id: row.listing.id, slug: row.listing.slug, title: row.listing.title, shopName: row.listing.shop.name },
  reason: row.reason,
  comment: row.comment,
  status: row.status,
  decidedAt: row.decidedAt,
  createdAt: row.createdAt,
});

const photoRows = (photos: string[]) => photos.map((url, position) => ({ url, position }));

function whereOf({ shopId, statuses, visibleAt }: ListingsQuery): Prisma.ListingWhereInput {
  return {
    ...(shopId ? { shopId } : {}),
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(visibleAt
      ? {
          status: 'published',
          shop: {
            status: 'active',
            OR: [{ plan: { kind: 'free' } }, { accessEndsAt: { gt: addDays(visibleAt.now, -visibleAt.graceDays) } }],
          },
        }
      : {}),
  };
}

/**
 * Recherche des annonces en SQL paramétré (32.4) : la distance et le tri par distance ne s'expriment pas avec
 * l'API de requête de Prisma. Aucune valeur n'est concaténée : tout passe par des paramètres (Prisma.sql).
 */
function searchQuery(c: ListingSearch) {
  const cutoff = addDays(c.visibleAt.now, -c.visibleAt.graceDays);
  const where: Prisma.Sql[] = [
    Prisma.sql`l.status = 'published'`,
    Prisma.sql`s.status = 'active'`,
    Prisma.sql`(ap.kind = 'free' OR s.access_ends_at > ${cutoff})`,
  ];
  if (c.categorySlug) where.push(Prisma.sql`l.category_id IN (SELECT id FROM tree)`);
  if (c.search) {
    const pattern = `%${escapeLike(c.search)}%`;
    where.push(Prisma.sql`(l.title ILIKE ${pattern} OR l.description ILIKE ${pattern})`);
  }
  if (c.kind) where.push(Prisma.sql`l.kind = ${c.kind}::"ListingKind"`);
  if (c.conditions?.length) where.push(Prisma.sql`l.condition = ANY(${c.conditions}::"ListingCondition"[])`);
  if (c.city) where.push(Prisma.sql`LOWER(l.city) = LOWER(${c.city})`);
  if (c.district) where.push(Prisma.sql`LOWER(l.district) = LOWER(${c.district})`);
  if (c.minPrice !== undefined) where.push(Prisma.sql`l.price >= ${c.minPrice}`);
  if (c.maxPrice !== undefined) where.push(Prisma.sql`l.price <= ${c.maxPrice}`);

  const near = c.near;
  // Haversine, comme distanceKm (listings.rules.ts)
  const distance = near
    ? Prisma.sql`CASE WHEN s.latitude IS NULL THEN NULL ELSE 2 * 6371 * ASIN(LEAST(1, SQRT(
        POWER(SIN(RADIANS((s.latitude::float8 - ${near.latitude}::float8) / 2)), 2)
        + COS(RADIANS(${near.latitude}::float8)) * COS(RADIANS(s.latitude::float8))
          * POWER(SIN(RADIANS((s.longitude::float8 - ${near.longitude}::float8) / 2)), 2)))) END`
    : Prisma.sql`NULL::float8`;
  if (near && c.maxKm !== undefined) {
    const box = boundingBox(near, c.maxKm);
    where.push(
      Prisma.sql`s.latitude BETWEEN ${box.minLat} AND ${box.maxLat} AND s.longitude BETWEEN ${box.minLng} AND ${box.maxLng}`,
    );
  }
  // Mise en avant validée et en cours à la date de la recherche (32.10)
  const sponsored = Prisma.sql`EXISTS (SELECT 1 FROM listing_boosts b WHERE b.listing_id = l.id
    AND b.status = 'validated' AND b.starts_at <= ${c.visibleAt.now} AND b.ends_at > ${c.visibleAt.now})`;
  const startsWith = c.search ? Prisma.sql`l.title ILIKE ${`${escapeLike(c.search)}%`}` : Prisma.sql`FALSE`;

  // Une catégorie inclut ses sous-catégories ; une collection inclut ses catégories membres et leurs sous-catégories
  const tree = c.categorySlug
    ? Prisma.sql`RECURSIVE root AS (SELECT id FROM categories WHERE slug = ${c.categorySlug}),
        seeds AS (SELECT id FROM root UNION SELECT cm.category_id FROM collection_members cm JOIN root ON cm.collection_id = root.id),
        tree AS (SELECT id FROM seeds UNION SELECT ch.id FROM categories ch JOIN tree ON ch.parent_id = tree.id),`
    : Prisma.empty;

  const matched = Prisma.sql`WITH ${tree} matched AS (
    SELECT l.id, l.published_at, l.price, ${startsWith} AS starts_with, ${distance} AS distance,
      ${sponsored} AS sponsored
    FROM listings l JOIN shops s ON s.id = l.shop_id JOIN access_plans ap ON ap.id = s.plan_id
    WHERE ${Prisma.join(where, ' AND ')}),
    kept AS (SELECT * FROM matched ${near && c.maxKm !== undefined ? Prisma.sql`WHERE distance <= ${c.maxKm}` : Prisma.empty})`;

  const order = {
    // Classement par défaut : les annonces mises en avant d'abord. Un tri choisi par l'acheteur (prix, distance)
    // est respecté tel quel
    relevance: c.search
      ? Prisma.sql`sponsored DESC, starts_with DESC, published_at DESC`
      : Prisma.sql`sponsored DESC, published_at DESC`,
    distance: Prisma.sql`distance ASC NULLS LAST, published_at DESC`,
    '-publishedAt': Prisma.sql`sponsored DESC, published_at DESC`,
    price: Prisma.sql`price ASC`,
    '-price': Prisma.sql`price DESC`,
  }[c.sort];

  return {
    page: Prisma.sql`${matched} SELECT id, distance, sponsored FROM kept ORDER BY ${order}, id LIMIT ${c.limit} OFFSET ${(c.page - 1) * c.limit}`,
    count: Prisma.sql`${matched} SELECT COUNT(*) AS total FROM kept`,
  };
}

export const listingsRepository: ListingsRepository = {
  async search(criteria) {
    const query = searchQuery(criteria);
    const [rows, counted] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; distance: number | null; sponsored: boolean }>>(query.page),
      prisma.$queryRaw<Array<{ total: bigint }>>(query.count),
    ]);
    return {
      hits: rows.map((r) => ({ id: r.id, distanceKm: r.distance, sponsored: r.sponsored })),
      total: Number(counted[0]?.total ?? 0),
    };
  },

  async findByIds(ids) {
    if (!ids.length) return [];
    const rows = await prisma.listing.findMany({ where: { id: { in: ids } }, include: listingInclude });
    const byId = new Map(rows.map((r) => [r.id, toListing(r)] as const));
    // L'ordre de la recherche est conservé
    return ids.flatMap((id) => byId.get(id) ?? []);
  },

  async categoryLabel(categoryId) {
    const row = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { name: true, fullName: true, isCollection: true },
    });
    return row ? { label: row.fullName ?? row.name, isCollection: row.isCollection } : null;
  },

  async create({ photos, ...listing }) {
    if (await prisma.listing.findUnique({ where: { slug: listing.slug }, select: { id: true } })) return 'slug_taken';
    try {
      return toListing(
        await prisma.listing.create({
          data: { ...listing, photos: { create: photoRows(photos) } },
          include: listingInclude,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) return 'slug_taken';
      throw error;
    }
  },

  async findById(id) {
    const row = await prisma.listing.findUnique({ where: { id }, include: listingInclude });
    return row ? toListing(row) : null;
  },

  async findBySlug(slug) {
    const row = await prisma.listing.findUnique({ where: { slug }, include: listingInclude });
    return row ? toListing(row) : null;
  },

  async list(query) {
    const where = whereOf(query);
    const [rows, total] = await prisma.$transaction([
      prisma.listing.findMany({
        where,
        include: listingInclude,
        orderBy: query.visibleAt ? { publishedAt: 'desc' } : { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.listing.count({ where }),
    ]);
    return { items: rows.map(toListing), total };
  },

  async update(id, { photos, ...fields }) {
    const row = await prisma.$transaction(async (tx) => {
      if (photos) {
        await tx.listingPhoto.deleteMany({ where: { listingId: id } });
        await tx.listingPhoto.createMany({ data: photoRows(photos).map((p) => ({ ...p, listingId: id })) });
      }
      return tx.listing.update({ where: { id }, data: fields, include: listingInclude });
    });
    return toListing(row);
  },

  async submit(id, from, at) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.listing.updateMany({
        where: { id, status: { in: from } },
        data: { status: 'in_review', version: { increment: 1 }, submittedAt: at },
      });
      if (!count) return null;
      return (await tx.listing.findUniqueOrThrow({ where: { id }, select: { version: true } })).version;
    });
  },

  async applyReview(id, expected, review, next, at) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.listing.updateMany({
        where: { id, version: expected.version, status: { in: expected.statuses } },
        data: { status: next, ...(next === 'published' ? { publishedAt: at } : {}) },
      });
      if (!count) return false;
      // Conversion explicite en objets JSON simples (une interface n'est pas assignable au type JSON de Prisma)
      const issues = review.issues.map(({ field, message }) => ({ field, message }));
      await tx.listingReview.create({
        data: { ...review, issues, listingId: id, version: expected.version, createdAt: at },
        select: { id: true },
      });
      return true;
    });
  },

  async setStatus(id, from, to) {
    const { count } = await prisma.listing.updateMany({ where: { id, status: { in: from } }, data: { status: to } });
    return count === 1;
  },

  async reviews(listingId) {
    const rows = await prisma.listingReview.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        version: true,
        source: true,
        outcome: true,
        issues: true,
        reason: true,
        model: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({ ...row, issues: issuesSchema.parse(row.issues) }));
  },

  aiReviewCount: (since) =>
    prisma.listingReview.count({ where: { source: 'ai', model: { not: null }, createdAt: { gte: since } } }),

  async createReport(report) {
    const open = await prisma.listingReport.findFirst({
      where: { listingId: report.listingId, reporterId: report.reporterId, status: 'open' },
      select: { id: true },
    });
    if (open) return 'already_open';
    try {
      return toReport(await prisma.listingReport.create({ data: report, include: reportInclude }));
    } catch (error) {
      if (isUniqueViolation(error)) return 'already_open';
      throw error;
    }
  },

  async listReports({ status, listingId, page, limit }) {
    const where: Prisma.ListingReportWhereInput = {
      ...(status ? { status } : {}),
      ...(listingId ? { listingId } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.listingReport.findMany({
        where,
        include: reportInclude,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.listingReport.count({ where }),
    ]);
    return { items: rows.map(toReport), total };
  },

  async decideReport(id, { status, staffId, at }) {
    if (!(await prisma.listingReport.findUnique({ where: { id }, select: { id: true } }))) return null;
    const { count } = await prisma.listingReport.updateMany({
      where: { id, status: 'open' },
      data: { status, decidedById: staffId, decidedAt: at },
    });
    if (!count) return 'stale';
    return toReport(await prisma.listingReport.findUniqueOrThrow({ where: { id }, include: reportInclude }));
  },
};
