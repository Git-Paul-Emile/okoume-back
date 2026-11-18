import { randomUUID } from 'node:crypto';
import type { CustomerRecord } from '../src/features/auth/auth.repository.js';
import {
  ANONYMOUS_NAME,
  anonymousEmail,
  hasBlockers,
  type DeletionBlockers,
  type PrivacyRepository,
  type PrivacyRequestRecord,
} from '../src/features/privacy/privacy.repository.js';

type StoredCustomer = CustomerRecord & { phoneKey: string | null; lastLoginAt: Date | null };

const NONE: DeletionBlockers = { orders: [], returns: [], listingRequests: [], shop: false };

/**
 * Données personnelles en mémoire, sur les clients du dépôt d'authentification : mêmes règles que la base
 * (numéro unique, blocages revérifiés avant l'anonymisation, inactivité mesurée sur connexion et commandes).
 */
export function createMemoryPrivacy(
  customers: StoredCustomer[],
  staff: () => Array<{ id: string; firstName: string; lastName: string }>,
  now: () => Date,
) {
  const requests: PrivacyRequestRecord[] = [];
  /** Échanges en cours par client, posés par les tests */
  const blocked = new Map<string, DeletionBlockers>();
  /** Dates de commande par client, pour l'inactivité */
  const orderDates = new Map<string, Date[]>();
  const copy = (r: PrivacyRequestRecord): PrivacyRequestRecord => structuredClone(r);

  const repository: PrivacyRepository = {
    async create(request) {
      if (requests.some((r) => r.number === request.number)) return null;
      const created = { ...structuredClone(request), id: randomUUID(), createdAt: now() };
      requests.push(created);
      return copy(created);
    },
    findById: async (id) => {
      const r = requests.find((x) => x.id === id);
      return r ? copy(r) : null;
    },
    listForCustomer: async (customerId) =>
      requests
        .filter((r) => r.customerId === customerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(copy),
    async list({ status, page, limit }) {
      const matching = requests
        .filter((r) =>
          status === 'open' ? r.status === 'received' || r.status === 'in_progress' : !status || r.status === status,
        )
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
      return { items: matching.slice((page - 1) * limit, page * limit).map(copy), total: matching.length };
    },
    async update(id, changes, event) {
      const r = requests.find((x) => x.id === id);
      if (!r) return null;
      Object.assign(r, changes);
      r.history.push(event);
      return copy(r);
    },
    blockers: async (customerId) => blocked.get(customerId) ?? NONE,
    async anonymize(customerId, at) {
      const blockers = blocked.get(customerId) ?? NONE;
      if (hasBlockers(blockers)) return blockers;
      const customer = customers.find((c) => c.id === customerId);
      if (!customer) throw new Error(`Client inconnu : ${customerId}`);
      Object.assign(customer, {
        email: anonymousEmail(customerId),
        phone: null,
        phoneKey: null,
        passwordHash: '',
        firstName: 'Client',
        lastName: 'supprimé',
        birthDate: null,
        status: 'anonymized' as const,
        anonymizedAt: at,
      });
      for (const r of requests.filter((x) => x.customerId === customerId))
        Object.assign(r, { name: ANONYMOUS_NAME, email: '' });
      return null;
    },
    async exportData(customerId) {
      const c = customers.find((x) => x.id === customerId);
      if (!c || c.status === 'anonymized') return null;
      return {
        profile: {
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          birthDate: c.birthDate?.toISOString().slice(0, 10) ?? null,
          createdAt: c.createdAt.toISOString(),
          lastLoginAt: c.lastLoginAt?.toISOString() ?? null,
          referralCode: c.referralCode,
          notificationPrefs: {},
        },
        addresses: [],
        orders: [],
        loyaltyMovements: [],
        supportRequests: [],
        listingRequests: [],
        favorites: [],
        reviews: [],
        privacyRequests: requests
          .filter((r) => r.customerId === customerId)
          .map((r) => ({ number: r.number, type: r.type, status: r.status, createdAt: r.createdAt.toISOString() })),
      };
    },
    inactiveCustomers: async (before, limit) =>
      customers
        .filter(
          (c) =>
            c.status !== 'anonymized' &&
            (c.lastLoginAt ?? c.createdAt) < before &&
            !(orderDates.get(c.id) ?? []).some((d) => d >= before) &&
            !(blocked.get(c.id)?.shop ?? false),
        )
        .slice(0, limit)
        .map((c) => c.id),
    staffName: async (id) => {
      const member = staff().find((s) => s.id === id);
      return member ? `${member.firstName} ${member.lastName}` : null;
    },
  };
  return { repository, requests, blocked, orderDates };
}
