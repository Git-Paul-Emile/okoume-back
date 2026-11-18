import { randomUUID } from 'node:crypto';
import type {
  ZoneRequestRecord,
  ZoneRequestsRepository,
} from '../src/features/zone-requests/zone-requests.repository.js';

/** Demandes de quartier en mémoire : une suite n'est donnée qu'une fois, comme en base. */
export function createMemoryZoneRequests(now: () => Date) {
  const requests: ZoneRequestRecord[] = [];
  const repository: ZoneRequestsRepository = {
    async create(input) {
      const created: ZoneRequestRecord = { ...input, id: randomUUID(), status: 'new', note: null, createdAt: now() };
      requests.push(created);
      return structuredClone(created);
    },
    list: async () =>
      [...requests].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((r) => structuredClone(r)),
    async decide(id, decision) {
      const r = requests.find((x) => x.id === id && x.status === 'new');
      if (!r) return null;
      Object.assign(r, decision);
      return structuredClone(r);
    },
  };
  return { repository, requests };
}
