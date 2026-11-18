import { randomUUID } from 'node:crypto';
import type {
  ActivityRecord,
  StaffActivityRepository,
} from '../src/features/staff-activity/staff-activity.repository.js';

/** Journal en mémoire : ajout seul, les plus récents d'abord. Nom et rôle du membre posés par les tests. */
export function createMemoryStaffActivity() {
  const entries: ActivityRecord[] = [];
  const repository: StaffActivityRepository = {
    async record(entry, at) {
      entries.push({ ...entry, id: randomUUID(), staffName: 'Membre', role: 'orders_manager', createdAt: at });
    },
    async list({ staffId, page, limit }) {
      const matching = entries
        .filter((e) => !staffId || e.staffId === staffId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return { items: matching.slice((page - 1) * limit, page * limit), total: matching.length };
    },
  };
  return { repository, entries };
}
