import type { CustomerRecord } from '../src/features/auth/auth.repository.js';
import {
  hasBlockers,
  type DeletionBlockers,
  type PrivacyRepository,
} from '../src/features/privacy/privacy.repository.js';

type StoredCustomer = CustomerRecord & { phoneKey: string | null; lastLoginAt: Date | null };

const NONE: DeletionBlockers = { orders: [], returns: [], listingRequests: [], shop: false };

/** Données en mémoire pour tester le traitement de conservation des comptes inactifs. */
export function createMemoryPrivacy(customers: StoredCustomer[]) {
  const blocked = new Map<string, DeletionBlockers>();
  const orderDates = new Map<string, Date[]>();

  const repository: PrivacyRepository = {
    async anonymize(customerId, at) {
      const blockers = blocked.get(customerId) ?? NONE;
      if (hasBlockers(blockers)) return blockers;
      const customer = customers.find((item) => item.id === customerId);
      if (!customer) throw new Error(`Client inconnu : ${customerId}`);
      Object.assign(customer, {
        email: `supprime-${customerId}@anonyme.invalid`,
        phone: null,
        phoneKey: null,
        passwordHash: '',
        firstName: 'Client',
        lastName: 'supprimé',
        birthDate: null,
        status: 'anonymized' as const,
        anonymizedAt: at,
      });
      return null;
    },
    async inactiveCustomers(before, limit) {
      return customers
        .filter(
          (customer) =>
            customer.status !== 'anonymized' &&
            (customer.lastLoginAt ?? customer.createdAt) < before &&
            !(orderDates.get(customer.id) ?? []).some((date) => date >= before) &&
            !(blocked.get(customer.id)?.shop ?? false),
        )
        .slice(0, limit)
        .map((customer) => customer.id);
    },
  };

  return { repository, blocked, orderDates };
}
