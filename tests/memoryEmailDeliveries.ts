import type {
  DeliveryRecord,
  EmailDeliveriesRepository,
} from '../src/features/email-deliveries/email-deliveries.repository.js';

/** Suivi des envois en mémoire : mêmes règles que la base (texte effacé une fois parti, une seule relance). */
export function createMemoryEmailDeliveries(now: () => Date) {
  const deliveries: DeliveryRecord[] = [];
  const find = (id: string) => deliveries.find((d) => d.id === id);
  const repository: EmailDeliveriesRepository = {
    async startAttempt({ id, ...attempt }) {
      const current = find(id);
      if (current) Object.assign(current, { attempts: current.attempts + 1, status: 'sending' });
      else
        deliveries.push({
          id,
          ...attempt,
          status: 'sending',
          attempts: 1,
          lastError: null,
          sentAt: null,
          createdAt: now(),
        });
    },
    async markSent(id, at) {
      Object.assign(find(id) ?? {}, { status: 'sent', sentAt: at, text: null, lastError: null });
    },
    async markError(id, error) {
      Object.assign(find(id) ?? {}, { lastError: error });
    },
    async markFailed(id) {
      const d = find(id);
      if (d && d.status !== 'sent') d.status = 'failed';
    },
    async claimForRetry(id) {
      const d = find(id);
      if (!d || d.status !== 'failed' || d.sensitive || d.text === null) return null;
      const before = structuredClone(d);
      Object.assign(d, { status: 'retried', text: null });
      return before;
    },
    async list({ status, page, limit }) {
      const matching = deliveries
        .filter((d) => !status || d.status === status)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return {
        items: matching.slice((page - 1) * limit, page * limit).map((d) => structuredClone(d)),
        total: matching.length,
      };
    },
    countFailed: async () => deliveries.filter((d) => d.status === 'failed').length,
  };
  return { repository, deliveries };
}
