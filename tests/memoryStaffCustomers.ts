import type {
  CustomerDetailRecord,
  CustomerSummaryRecord,
  StaffCustomersRepository,
} from '../src/features/staff-customers/staff-customers.repository.js';

/** Fichier clients en mémoire : les agrégats (points, commandes, montant du niveau) sont posés par les tests. */
export function createMemoryStaffCustomers() {
  const customers: CustomerDetailRecord[] = [];
  const summary = ({ addresses: _a, orders: _o, movements: _m, ...c }: CustomerDetailRecord): CustomerSummaryRecord =>
    structuredClone(c);

  const repository: StaffCustomersRepository = {
    async list({ search, page, limit }) {
      const term = search?.toLowerCase();
      const matching = customers
        .filter((c) => c.status !== 'anonymized')
        .filter(
          (c) =>
            !term ||
            `${c.firstName} ${c.lastName}`.toLowerCase().includes(term) ||
            c.email.toLowerCase().includes(term) ||
            (c.phone ?? '').includes(term),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return { items: matching.slice((page - 1) * limit, page * limit).map(summary), total: matching.length };
    },
    find: async (id) => {
      const c = customers.find((x) => x.id === id);
      return c ? structuredClone(c) : null;
    },
  };
  return { repository, customers };
}
