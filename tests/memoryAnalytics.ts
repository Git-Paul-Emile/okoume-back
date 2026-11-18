import { randomUUID } from 'node:crypto';
import type { AnalyticsRepository, NewEvent } from '../src/features/analytics/analytics.repository.js';

/** Mesure d'audience en mémoire : événements bruts et compteur mensuel de l'assistant. */
export function createMemoryAnalytics() {
  const events: Array<NewEvent & { id: string; createdAt: Date }> = [];
  const usage = new Map<string, number>();
  const within = (at: Date, w: { from: Date; to: Date }) => at >= w.from && at < w.to;
  const repository: AnalyticsRepository = {
    async record(event, at) {
      events.push({ ...event, id: randomUUID(), createdAt: at });
    },
    productEvents: async (w, limit) =>
      events
        .filter((e) => within(e.createdAt, w) && (e.kind === 'product_view' || e.kind === 'product_click'))
        .slice(0, limit)
        .flatMap((e) =>
          e.productId && (e.kind === 'product_view' || e.kind === 'product_click')
            ? [{ id: e.id, productId: e.productId, kind: e.kind, createdAt: e.createdAt }]
            : [],
        ),
    searches: async (w, limit) =>
      events
        .filter((e) => within(e.createdAt, w) && e.kind === 'search')
        .slice(0, limit)
        .map((e) => ({ id: e.id, term: e.term ?? '', results: e.results ?? 0, createdAt: e.createdAt })),
    daily: async () => [],
    async purgeBefore(before) {
      const kept = events.filter((e) => e.createdAt >= before);
      const deleted = events.length - kept.length;
      events.splice(0, events.length, ...kept);
      return deleted;
    },
    usage: async (period) => usage.get(period) ?? 0,
    async incrementUsage(period) {
      const next = (usage.get(period) ?? 0) + 1;
      usage.set(period, next);
      return next;
    },
  };
  return { repository, events, usage };
}
