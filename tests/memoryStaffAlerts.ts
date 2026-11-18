import { randomUUID } from 'node:crypto';
import type { AlertCounts, StaffAlertsRepository } from '../src/features/staff-alerts/staff-alerts.repository.js';
import type { AlertRecord } from '../src/features/staff-alerts/staff-alerts.rules.js';

const ZERO: AlertCounts = {
  paymentsToVerify: 0,
  outOfStock: 0,
  lowStock: 0,
  lateSupport: 0,
  cancellationsPending: 0,
  returnsPending: 0,
  cashWaiting: 0,
  privacyOverdue: 0,
  listingsToModerate: 0,
  emailsFailed: 0,
};

/** Alertes en mémoire : les volumes détectés sont posés par les tests dans `counts`. */
export function createMemoryStaffAlerts(staff: () => Array<{ id: string; firstName: string; lastName: string }>) {
  const alerts: AlertRecord[] = [];
  const counts: AlertCounts = { ...ZERO };
  const repository: StaffAlertsRepository = {
    list: async () => alerts.map((a) => structuredClone(a)),
    find: async (id) => {
      const a = alerts.find((x) => x.id === id);
      return a ? structuredClone(a) : null;
    },
    async create(alert) {
      if (alerts.some((a) => a.key === alert.key)) throw new Error(`Clé déjà prise : ${alert.key}`);
      alerts.push({ ...structuredClone(alert), id: randomUUID() });
    },
    async update(id, changes) {
      const a = alerts.find((x) => x.id === id);
      if (!a) return null;
      Object.assign(a, structuredClone(changes));
      return structuredClone(a);
    },
    counts: async () => ({ ...counts }),
    staffExists: async (id) => staff().some((s) => s.id === id),
    staffName: async (id) => {
      const s = staff().find((x) => x.id === id);
      return s ? `${s.firstName} ${s.lastName}` : null;
    },
  };
  return { repository, alerts, counts };
}
