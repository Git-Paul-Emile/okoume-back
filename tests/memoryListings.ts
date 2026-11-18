import { randomUUID } from 'node:crypto';
import type { CategoryRecord } from '../src/features/categories/categories.repository.js';
import type {
  ListingFields,
  ListingRecord,
  ListingsRepository,
  ListingStatus,
  ReportRecord,
  ReviewRecord,
} from '../src/features/listings/listings.repository.js';
import { distanceKm, publiclyVisible } from '../src/features/listings/listings.rules.js';
import type { ShopsRepository } from '../src/features/shops/shops.repository.js';

type StoredListing = Omit<ListingRecord, 'shop' | 'category'> & { shopId: string; categoryId: string };
type Scored = { listing: StoredListing; km: number | null; startsWith: boolean; sponsored: boolean };
type StoredReport = Omit<ReportRecord, 'listing'> & { listingId: string; reporterId: string };

/**
 * Annonces en mémoire, même contrat que Prisma : un avis ne s'applique qu'à sa version et à l'état attendu, un
 * signalement ouvert par client et par annonce. La boutique et la catégorie viennent des autres dépôts en mémoire.
 */
export function createMemoryListings(store: {
  now: () => Date;
  shops: ShopsRepository;
  categories: CategoryRecord[];
  /** Mise en avant en cours (dépôt des mises en avant en mémoire, créé après celui-ci) */
  sponsored?: (listingId: string, at: Date) => boolean;
}) {
  const listings: StoredListing[] = [];
  const reviews: Array<ReviewRecord & { listingId: string }> = [];
  const reports: StoredReport[] = [];

  async function toListing({ shopId, categoryId, ...listing }: StoredListing): Promise<ListingRecord> {
    const shop = await store.shops.findById(shopId);
    const category = store.categories.find((c) => c.id === categoryId);
    if (!shop || !category) throw new Error('Boutique ou catégorie absente');
    return {
      ...listing,
      photos: [...listing.photos],
      category: { id: category.id, label: category.fullName ?? category.name },
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
    };
  }

  const toReport = ({ listingId, reporterId: _r, ...report }: StoredReport): ReportRecord => {
    const listing = listings.find((l) => l.id === listingId)!;
    return { ...report, listing: { id: listing.id, slug: listing.slug, title: listing.title, shopName: '' } };
  };

  const byId = (id: string) => listings.find((l) => l.id === id);

  /** Catégorie, ses sous-catégories et, pour une collection, ses membres et leurs sous-catégories. */
  function treeOf(slug: string) {
    const root = store.categories.find((c) => c.slug === slug);
    if (!root) return new Set<string>();
    const ids = new Set([root.id, ...root.memberIds]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of store.categories)
        if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
          ids.add(c.id);
          grew = true;
        }
    }
    return ids;
  }

  const repository: ListingsRepository = {
    async categoryLabel(categoryId) {
      const category = store.categories.find((c) => c.id === categoryId);
      return category ? { label: category.fullName ?? category.name, isCollection: category.isCollection } : null;
    },
    async create({ shopId, slug, categoryId, ...fields }) {
      if (listings.some((l) => l.slug === slug)) return 'slug_taken';
      const listing: StoredListing = {
        id: randomUUID(),
        shopId,
        slug,
        categoryId,
        ...fields,
        status: 'draft',
        version: 0,
        submittedAt: null,
        publishedAt: null,
        createdAt: store.now(),
      };
      listings.push(listing);
      return toListing(listing);
    },
    async findById(id) {
      const listing = byId(id);
      return listing ? toListing(listing) : null;
    },
    async findBySlug(slug) {
      const listing = listings.find((l) => l.slug === slug);
      return listing ? toListing(listing) : null;
    },
    async list({ shopId, statuses, visibleAt, page, limit }) {
      const all = await Promise.all(
        listings
          .filter((l) => (!shopId || l.shopId === shopId) && (!statuses || statuses.includes(l.status)))
          .map(toListing),
      );
      const found = visibleAt ? all.filter((l) => publiclyVisible(l, visibleAt.now, visibleAt.graceDays)) : all;
      return { items: found.slice((page - 1) * limit, page * limit), total: found.length };
    },
    async search(c) {
      const tree = c.categorySlug ? treeOf(c.categorySlug) : null;
      const term = c.search?.toLowerCase();
      const scored: Scored[] = [];
      for (const listing of listings) {
        const record = await toListing(listing);
        if (!publiclyVisible(record, c.visibleAt.now, c.visibleAt.graceDays)) continue;
        if (tree && !tree.has(listing.categoryId)) continue;
        if (term && !`${listing.title} ${listing.description}`.toLowerCase().includes(term)) continue;
        if (c.kind && listing.kind !== c.kind) continue;
        if (c.conditions?.length && (!listing.condition || !c.conditions.includes(listing.condition))) continue;
        if (c.city && listing.city.toLowerCase() !== c.city.toLowerCase()) continue;
        if (c.district && listing.district.toLowerCase() !== c.district.toLowerCase()) continue;
        if (c.minPrice !== undefined && listing.price < c.minPrice) continue;
        if (c.maxPrice !== undefined && listing.price > c.maxPrice) continue;
        const shop = await store.shops.findById(listing.shopId);
        const at =
          shop?.latitude != null && shop.longitude != null
            ? { latitude: shop.latitude, longitude: shop.longitude }
            : null;
        const km = c.near && at ? distanceKm(c.near, at) : null;
        if (c.maxKm !== undefined && (km === null || km > c.maxKm)) continue;
        scored.push({
          listing,
          km,
          startsWith: !!term && listing.title.toLowerCase().startsWith(term),
          sponsored: store.sponsored?.(listing.id, c.visibleAt.now) ?? false,
        });
      }
      const recent = (a: Scored, b: Scored) =>
        (b.listing.publishedAt?.getTime() ?? 0) - (a.listing.publishedAt?.getTime() ?? 0);
      const order = {
        relevance: (a: Scored, b: Scored) =>
          Number(b.sponsored) - Number(a.sponsored) || Number(b.startsWith) - Number(a.startsWith) || recent(a, b),
        distance: (a: Scored, b: Scored) => (a.km ?? Infinity) - (b.km ?? Infinity) || recent(a, b),
        '-publishedAt': (a: Scored, b: Scored) => Number(b.sponsored) - Number(a.sponsored) || recent(a, b),
        price: (a: Scored, b: Scored) => a.listing.price - b.listing.price,
        '-price': (a: Scored, b: Scored) => b.listing.price - a.listing.price,
      }[c.sort];
      scored.sort(order);
      return {
        hits: scored
          .slice((c.page - 1) * c.limit, c.page * c.limit)
          .map((s) => ({ id: s.listing.id, distanceKm: s.km, sponsored: s.sponsored })),
        total: scored.length,
      };
    },
    async findByIds(ids) {
      return Promise.all(ids.flatMap((id) => (byId(id) ? [toListing(byId(id)!)] : [])));
    },
    async update(id, fields: Partial<ListingFields>) {
      const listing = byId(id)!;
      Object.assign(listing, fields);
      return toListing(listing);
    },
    async submit(id, from, at) {
      const listing = byId(id);
      if (!listing || !from.includes(listing.status)) return null;
      Object.assign(listing, { status: 'in_review', version: listing.version + 1, submittedAt: at });
      return listing.version;
    },
    async applyReview(id, expected, review, next: ListingStatus, at) {
      const listing = byId(id);
      if (!listing || listing.version !== expected.version || !expected.statuses.includes(listing.status)) return false;
      listing.status = next;
      if (next === 'published') listing.publishedAt = at;
      reviews.push({
        id: randomUUID(),
        listingId: id,
        version: expected.version,
        source: review.source,
        outcome: review.outcome,
        issues: review.issues,
        reason: review.reason,
        model: review.model,
        createdAt: at,
      });
      return true;
    },
    async setStatus(id, from, to) {
      const listing = byId(id);
      if (!listing || !from.includes(listing.status)) return false;
      listing.status = to;
      return true;
    },
    async reviews(listingId) {
      return reviews
        .filter((r) => r.listingId === listingId)
        .reverse()
        .map(({ listingId: _l, ...r }) => r);
    },
    async aiReviewCount(since) {
      return reviews.filter((r) => r.source === 'ai' && r.model !== null && r.createdAt >= since).length;
    },
    async createReport({ listingId, reporterId, reason, comment }) {
      if (reports.some((r) => r.listingId === listingId && r.reporterId === reporterId && r.status === 'open'))
        return 'already_open';
      const report: StoredReport = {
        id: randomUUID(),
        listingId,
        reporterId,
        reason,
        comment,
        status: 'open',
        decidedAt: null,
        createdAt: store.now(),
      };
      reports.push(report);
      return toReport(report);
    },
    async listReports({ status, listingId, page, limit }) {
      const found = reports.filter(
        (r) => (!status || r.status === status) && (!listingId || r.listingId === listingId),
      );
      return { items: found.slice((page - 1) * limit, page * limit).map(toReport), total: found.length };
    },
    async decideReport(id, { status, at }) {
      const report = reports.find((r) => r.id === id);
      if (!report) return null;
      if (report.status !== 'open') return 'stale';
      Object.assign(report, { status, decidedAt: at });
      return toReport(report);
    },
  };

  return { repository, listings, reviews, reports };
}
