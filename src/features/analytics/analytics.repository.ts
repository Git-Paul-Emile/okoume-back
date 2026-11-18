import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export type AnalyticsKind = 'visit' | 'product_view' | 'product_click' | 'search' | 'add_to_cart' | 'checkout';

export interface NewEvent {
  kind: AnalyticsKind;
  productId: string | null;
  term: string | null;
  results: number | null;
  pwa: boolean;
}

export interface ProductEventRecord {
  id: string;
  productId: string;
  kind: 'product_view' | 'product_click';
  createdAt: Date;
}

export interface SearchEventRecord {
  id: string;
  term: string;
  results: number;
  createdAt: Date;
}

/** Totaux d'une journée (fuseau de la boutique), base des courbes de fréquentation. */
export interface DailyRecord {
  day: string;
  visits: number;
  pwaVisits: number;
  productViews: number;
  addToCart: number;
  checkouts: number;
  orders: number;
}

export interface Window {
  from: Date;
  to: Date;
}

/** Contrat de stockage de la mesure d'audience. */
export interface AnalyticsRepository {
  record(event: NewEvent, at: Date): Promise<void>;
  productEvents(window: Window, limit: number): Promise<ProductEventRecord[]>;
  searches(window: Window, limit: number): Promise<SearchEventRecord[]>;
  daily(window: Window): Promise<DailyRecord[]>;
  /** Supprime les événements plus anciens que la date ; rend le nombre supprimé. */
  purgeBefore(before: Date): Promise<number>;
  usage(period: string): Promise<number>;
  /** Incrément atomique du compteur du mois ; rend la nouvelle valeur. */
  incrementUsage(period: string): Promise<number>;
}

const inWindow = ({ from, to }: Window) =>
  ({ createdAt: { gte: from, lt: to } }) satisfies Prisma.AnalyticsEventWhereInput;

type DailyRow = {
  day: string;
  visits: bigint;
  pwa_visits: bigint;
  product_views: bigint;
  add_to_cart: bigint;
  checkouts: bigint;
  orders: bigint;
};

export const analyticsRepository: AnalyticsRepository = {
  async record(event, at) {
    await prisma.analyticsEvent.create({ data: { ...event, createdAt: at } });
  },

  productEvents: async (window, limit) =>
    (
      await prisma.analyticsEvent.findMany({
        where: { ...inWindow(window), kind: { in: ['product_view', 'product_click'] }, productId: { not: null } },
        select: { id: true, productId: true, kind: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
    ).flatMap((e) =>
      e.productId && (e.kind === 'product_view' || e.kind === 'product_click')
        ? [{ id: e.id, productId: e.productId, kind: e.kind, createdAt: e.createdAt }]
        : [],
    ),

  searches: async (window, limit) =>
    (
      await prisma.analyticsEvent.findMany({
        where: { ...inWindow(window), kind: 'search' },
        select: { id: true, term: true, results: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
    ).map((e) => ({ id: e.id, term: e.term ?? '', results: e.results ?? 0, createdAt: e.createdAt })),

  async daily({ from, to }) {
    // Journées comptées à l'heure de Libreville ; les commandes viennent de leur table, pas d'un événement
    const rows = await prisma.$queryRaw<DailyRow[]>`
      WITH days AS (
        SELECT to_char(d, 'YYYY-MM-DD') AS day
        FROM generate_series(
          date_trunc('day', ${from}::timestamptz AT TIME ZONE 'Africa/Libreville'),
          date_trunc('day', (${to}::timestamptz - interval '1 second') AT TIME ZONE 'Africa/Libreville'),
          interval '1 day') AS d
      ),
      events AS (
        SELECT to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Libreville', 'YYYY-MM-DD') AS day,
               COUNT(*) FILTER (WHERE kind = 'visit') AS visits,
               COUNT(*) FILTER (WHERE kind = 'visit' AND pwa) AS pwa_visits,
               COUNT(*) FILTER (WHERE kind = 'product_view') AS product_views,
               COUNT(*) FILTER (WHERE kind = 'add_to_cart') AS add_to_cart,
               COUNT(*) FILTER (WHERE kind = 'checkout') AS checkouts
        FROM analytics_events
        WHERE created_at >= ${from} AND created_at < ${to}
        GROUP BY 1
      ),
      placed AS (
        SELECT to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Libreville', 'YYYY-MM-DD') AS day,
               COUNT(*) AS orders
        FROM orders
        WHERE created_at >= ${from} AND created_at < ${to}
        GROUP BY 1
      )
      SELECT days.day,
             COALESCE(e.visits, 0) AS visits, COALESCE(e.pwa_visits, 0) AS pwa_visits,
             COALESCE(e.product_views, 0) AS product_views, COALESCE(e.add_to_cart, 0) AS add_to_cart,
             COALESCE(e.checkouts, 0) AS checkouts, COALESCE(p.orders, 0) AS orders
      FROM days LEFT JOIN events e ON e.day = days.day LEFT JOIN placed p ON p.day = days.day
      ORDER BY days.day`;
    return rows.map((r) => ({
      day: r.day,
      visits: Number(r.visits),
      pwaVisits: Number(r.pwa_visits),
      productViews: Number(r.product_views),
      addToCart: Number(r.add_to_cart),
      checkouts: Number(r.checkouts),
      orders: Number(r.orders),
    }));
  },

  purgeBefore: async (before) =>
    (await prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: before } } })).count,

  usage: async (period) => (await prisma.assistantUsage.findUnique({ where: { period } }))?.count ?? 0,

  incrementUsage: async (period) =>
    (
      await prisma.assistantUsage.upsert({
        where: { period },
        create: { period, count: 1 },
        update: { count: { increment: 1 } },
        select: { count: true },
      })
    ).count,
};
