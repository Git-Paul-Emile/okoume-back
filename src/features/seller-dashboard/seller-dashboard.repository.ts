import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import type { ListingStatus } from '../listings/listings.repository.js';

/** Compteur de visites d'une annonce : écrit à chaque consultation de la fiche publique. */
export interface ListingViewsRecorder {
  recordView(listingId: string, day: Date): Promise<void>;
}

export interface ViewsByDay {
  day: Date;
  count: number;
}

/** Contrat de l'espace vendeur (32.8) : chiffres agrégés de la boutique, jamais de donnée sur les visiteurs. */
export interface SellerDashboardRepository extends ListingViewsRecorder {
  listingCounts(shopId: string): Promise<Partial<Record<ListingStatus, number>>>;
  openRequestCounts(shopId: string): Promise<{ sent: number; accepted: number }>;
  conversationsAwaitingSeller(shopId: string): Promise<number>;
  /** Visites de la boutique depuis cette date, et ses annonces les plus vues. */
  shopViews(
    shopId: string,
    since: Date,
    top: number,
  ): Promise<{
    total: number;
    topListings: Array<{ id: string; slug: string; title: string; views: number }>;
  }>;
  listingViews(listingId: string, since: Date): Promise<ViewsByDay[]>;
}

export const sellerDashboardRepository: SellerDashboardRepository = {
  /** Une seule requête, sans lecture préalable : deux visites simultanées ne perdent aucun compte. */
  async recordView(listingId, day) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO listing_views (listing_id, day, count) VALUES (${listingId}::uuid, ${day}::date, 1)
      ON CONFLICT (listing_id, day) DO UPDATE SET count = listing_views.count + 1`);
  },

  async listingCounts(shopId) {
    const rows = await prisma.listing.groupBy({ by: ['status'], where: { shopId }, _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  },

  async openRequestCounts(shopId) {
    const rows = await prisma.listingRequest.groupBy({
      by: ['status'],
      where: { shopId, status: { in: ['sent', 'accepted'] } },
      _count: { _all: true },
    });
    const count = (status: string) => rows.find((r) => r.status === status)?._count._all ?? 0;
    return { sent: count('sent'), accepted: count('accepted') };
  },

  conversationsAwaitingSeller: (shopId) => prisma.conversation.count({ where: { shopId, needsSeller: true } }),

  async shopViews(shopId, since, top) {
    const rows = await prisma.listingView.groupBy({
      by: ['listingId'],
      where: { day: { gte: since }, listing: { shopId } },
      _sum: { count: true },
      orderBy: { _sum: { count: 'desc' } },
    });
    const best = rows.slice(0, top);
    const listings = await prisma.listing.findMany({
      where: { id: { in: best.map((r) => r.listingId) } },
      select: { id: true, slug: true, title: true },
    });
    const byId = new Map(listings.map((l) => [l.id, l] as const));
    return {
      total: rows.reduce((sum, r) => sum + (r._sum.count ?? 0), 0),
      topListings: best.flatMap((r) => {
        const listing = byId.get(r.listingId);
        return listing ? [{ ...listing, views: r._sum.count ?? 0 }] : [];
      }),
    };
  },

  async listingViews(listingId, since) {
    return prisma.listingView.findMany({
      where: { listingId, day: { gte: since } },
      select: { day: true, count: true },
      orderBy: { day: 'asc' },
    });
  },
};
