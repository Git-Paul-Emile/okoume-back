import { ForbiddenError, NotFoundError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import { tierFor } from '../orders/orders.pricing.js';
import type { LoyaltyRepository } from '../loyalty/loyalty.repository.js';
import type {
  CustomerDetailRecord,
  CustomerSummaryRecord,
  StaffCustomersRepository,
} from './staff-customers.repository.js';

/** Coordonnée masquée sans le droit sur les données sensibles (19.4) : début et fin seulement. */
export function mask(value: string | null) {
  if (!value) return value;
  const at = value.indexOf('@');
  if (at > 0) return `${value.slice(0, Math.min(2, at))}•••${value.slice(at)}`;
  return value.length <= 4 ? '••••' : `${'•'.repeat(value.length - 2)}${value.slice(-2)}`;
}

export interface StaffCustomersDependencies {
  customers: StaffCustomersRepository;
  loyalty: Pick<LoyaltyRepository, 'settings'>;
}

/**
 * Fichier clients de l'équipe (2.4, 12) : lecture clients:consulter. E-mail, téléphone et repères d'adresse sont
 * masqués par l'API elle-même sans donnees_sensibles:consulter : le masquage n'est jamais laissé à l'interface.
 */
export const createStaffCustomersService = (deps: StaffCustomersDependencies) => {
  const { customers, loyalty } = deps;

  async function thresholds() {
    const s = await loyalty.settings();
    return { silver: s.silverThreshold, gold: s.goldThreshold };
  }

  const toDto = (c: CustomerSummaryRecord, t: { silver: number; gold: number }, sensitive: boolean) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: sensitive ? c.email : mask(c.email),
    phone: sensitive ? c.phone : mask(c.phone),
    status: c.status,
    referralCode: c.referralCode,
    createdAt: c.createdAt.toISOString(),
    lastLoginAt: c.lastLoginAt?.toISOString() ?? null,
    points: c.points,
    tier: tierFor(c.qualifyingSpend, t),
    orderCount: c.orderCount,
    totalSpent: c.totalSpent,
  });

  const toDetailDto = (c: CustomerDetailRecord, t: { silver: number; gold: number }, sensitive: boolean) => ({
    ...toDto(c, t, sensitive),
    addresses: c.addresses.map((a) => ({ ...a, landmark: sensitive ? a.landmark : 'Adresse masquée' })),
    orders: c.orders.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
    movements: c.movements.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
  });

  function require(actor: Grantee) {
    if (!can(actor, 'clients:consulter')) throw new ForbiddenError();
  }

  return {
    async list(query: { search?: string | undefined; page: number; limit: number }, actor: Grantee) {
      require(actor);
      const [{ items, total }, t] = await Promise.all([customers.list(query), thresholds()]);
      const sensitive = can(actor, 'donnees_sensibles:consulter');
      return paginate(
        items.map((c) => toDto(c, t, sensitive)),
        total,
        query.page,
        query.limit,
      );
    },

    async get(id: string, actor: Grantee) {
      require(actor);
      const [customer, t] = await Promise.all([customers.find(id), thresholds()]);
      if (!customer || customer.status === 'anonymized') throw new NotFoundError('Client introuvable.');
      return toDetailDto(customer, t, can(actor, 'donnees_sensibles:consulter'));
    },
  };
};

export type StaffCustomersService = ReturnType<typeof createStaffCustomersService>;
