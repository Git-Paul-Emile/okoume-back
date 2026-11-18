import { randomUUID } from 'node:crypto';
import type { ReviewRecord, ReviewsRepository } from '../src/features/reviews/reviews.repository.js';

/** Avis en mémoire : un avis par client et par produit, signalements uniques, décisions qui closent les signalements. */
export function createMemoryReviews(
  now: () => Date,
  staff: () => Array<{ id: string; firstName: string; lastName: string }>,
) {
  const reviews: ReviewRecord[] = [];
  const reports: Array<{ reviewId: string; customerId: string; reason: string }> = [];
  /** Produits reçus par client, posés par les tests */
  const received = new Set<string>();
  const productNames = new Map<string, string>();
  const withReports = (r: ReviewRecord): ReviewRecord => ({
    ...structuredClone(r),
    reports: reports.filter((x) => x.reviewId === r.id).map((x) => x.reason),
  });
  const newest = (a: ReviewRecord, b: ReviewRecord) => b.createdAt.getTime() - a.createdAt.getTime();

  const repository: ReviewsRepository = {
    findById: async (id) => {
      const r = reviews.find((x) => x.id === id);
      return r ? withReports(r) : null;
    },
    findMine: async (customerId, productId) => {
      const r = reviews.find((x) => x.customerId === customerId && x.productId === productId);
      return r ? withReports(r) : null;
    },
    async listApproved(productId, { page, limit }) {
      const matching = reviews.filter((r) => r.productId === productId && r.status === 'approved').sort(newest);
      return { items: matching.slice((page - 1) * limit, page * limit).map(withReports), total: matching.length };
    },
    async ratings() {
      const byProduct = new Map<string, number[]>();
      for (const r of reviews.filter((x) => x.status === 'approved'))
        byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r.rating]);
      return [...byProduct].map(([productId, ratings]) => ({
        productId,
        average: ratings.reduce((s, n) => s + n, 0) / ratings.length,
        count: ratings.length,
      }));
    },
    hasReceived: async (customerId, productId) => received.has(`${customerId}:${productId}`),
    async save(customerId, productId, authorName, content, event) {
      const current = reviews.find((x) => x.customerId === customerId && x.productId === productId);
      if (!current) {
        const created: ReviewRecord = {
          id: randomUUID(),
          productId,
          productName: productNames.get(productId) ?? 'Produit',
          customerId,
          authorName,
          ...structuredClone(content),
          status: 'pending',
          rejectionReason: null,
          history: [event],
          reports: [],
          createdAt: now(),
        };
        reviews.push(created);
        return withReports(created);
      }
      current.history.push({
        at: event.at,
        event: 'Avis modifié par le client',
        rating: current.rating,
        comment: current.comment,
      });
      Object.assign(current, { ...structuredClone(content), authorName, status: 'pending', rejectionReason: null });
      return withReports(current);
    },
    async report(reviewId, customerId, reason) {
      if (reports.some((x) => x.reviewId === reviewId && x.customerId === customerId)) return false;
      reports.push({ reviewId, customerId, reason });
      return true;
    },
    async list({ status, reported, page, limit }) {
      const matching = reviews
        .filter((r) => (!status || r.status === status) && (!reported || reports.some((x) => x.reviewId === r.id)))
        .sort(newest);
      return { items: matching.slice((page - 1) * limit, page * limit).map(withReports), total: matching.length };
    },
    async decide(id, decision, event) {
      const r = reviews.find((x) => x.id === id);
      if (!r) return null;
      for (let i = reports.length - 1; i >= 0; i--) if (reports[i]!.reviewId === id) reports.splice(i, 1);
      Object.assign(r, decision);
      r.history.push(event);
      return withReports(r);
    },
    staffName: async (id) => {
      const member = staff().find((s) => s.id === id);
      return member ? `${member.firstName} ${member.lastName}` : null;
    },
  };
  return { repository, reviews, reports, received, productNames };
}
