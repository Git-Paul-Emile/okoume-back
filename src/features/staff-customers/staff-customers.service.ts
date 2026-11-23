import { ForbiddenError, NotFoundError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee } from '../../core/security/permissions.js';
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
}

/**
 * Fichier clients de l'équipe (2.4, 12) : lecture clients:consulter. E-mail, téléphone et repères d'adresse sont
 * masqués par l'API elle-même sans donnees_sensibles:consulter : le masquage n'est jamais laissé à l'interface.
 */
export const createStaffCustomersService = (deps: StaffCustomersDependencies) => {
  const { customers } = deps;

  const toDto = (c: CustomerSummaryRecord, sensitive: boolean) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: sensitive ? c.email : mask(c.email),
    phone: sensitive ? c.phone : mask(c.phone),
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    lastLoginAt: c.lastLoginAt?.toISOString() ?? null,
    orderCount: c.orderCount,
    totalSpent: c.totalSpent,
  });

  const toDetailDto = (c: CustomerDetailRecord, sensitive: boolean) => ({
    ...toDto(c, sensitive),
    addresses: c.addresses.map((a) => ({ ...a, landmark: sensitive ? a.landmark : 'Adresse masquée' })),
    orders: c.orders.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
  });

  function require(actor: Grantee) {
    if (!can(actor, 'clients:consulter')) throw new ForbiddenError();
  }

  return {
    async list(query: { search?: string | undefined; page: number; limit: number }, actor: Grantee) {
      require(actor);
      const { items, total } = await customers.list(query);
      const sensitive = can(actor, 'donnees_sensibles:consulter');
      return paginate(
        items.map((c) => toDto(c, sensitive)),
        total,
        query.page,
        query.limit,
      );
    },

    async get(id: string, actor: Grantee) {
      require(actor);
      const customer = await customers.find(id);
      if (!customer || customer.status === 'anonymized') throw new NotFoundError('Client introuvable.');
      return toDetailDto(customer, can(actor, 'donnees_sensibles:consulter'));
    },
  };
};

export type StaffCustomersService = ReturnType<typeof createStaffCustomersService>;
