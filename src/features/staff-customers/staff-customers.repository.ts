import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export interface CustomerSummaryRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: 'pending_verification' | 'active' | 'anonymized';
  createdAt: Date;
  lastLoginAt: Date | null;
  /** Commandes non annulées */
  orderCount: number;
  /** Total de ces commandes */
  totalSpent: number;
}

export interface CustomerDetailRecord extends CustomerSummaryRecord {
  addresses: Array<{ id: string; label: string; zoneName: string; landmark: string }>;
  orders: Array<{ id: string; number: string; createdAt: Date; total: number; status: string }>;
}

export interface CustomerFilters {
  search?: string | undefined;
  page: number;
  limit: number;
}

/** Contrat de lecture des clients pour l'équipe. */
export interface StaffCustomersRepository {
  list(filters: CustomerFilters): Promise<{ items: CustomerSummaryRecord[]; total: number }>;
  find(id: string): Promise<CustomerDetailRecord | null>;
}

type SummaryRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  status: CustomerSummaryRecord['status'];
  created_at: Date;
  last_login_at: Date | null;
  order_count: bigint | null;
  total_spent: Prisma.Decimal | null;
};

const toSummary = (r: SummaryRow): CustomerSummaryRecord => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  email: r.email,
  phone: r.phone,
  status: r.status,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
  orderCount: Number(r.order_count ?? 0),
  totalSpent: Number(r.total_spent ?? 0),
});

/**
 * Agrégats par client en une requête (pas de N+1) : commandes non annulées et montant total.
 */
const summaries = (where: Prisma.Sql, page: { limit: number; offset: number }) =>
  prisma.$queryRaw<SummaryRow[]>`
    SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.status, c.created_at,
      c.last_login_at, o.order_count, o.total_spent
    FROM customers c
    LEFT JOIN (
      SELECT customer_id, COUNT(*) AS order_count, SUM(total) AS total_spent
      FROM orders WHERE status <> 'cancelled' GROUP BY customer_id
    ) o ON o.customer_id = c.id
    WHERE ${where}
    ORDER BY c.created_at DESC, c.id
    LIMIT ${page.limit} OFFSET ${page.offset}`;

const searchWhere = (search: string | undefined) => {
  if (!search) return Prisma.sql`c.status <> 'anonymized'`;
  const like = `%${search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return Prisma.sql`c.status <> 'anonymized' AND (c.first_name || ' ' || c.last_name ILIKE ${like}
    OR c.email ILIKE ${like} OR COALESCE(c.phone, '') ILIKE ${like})`;
};

export const staffCustomersRepository: StaffCustomersRepository = {
  async list({ search, page, limit }) {
    const where = searchWhere(search);
    const [rows, count] = await Promise.all([
      summaries(where, { limit, offset: (page - 1) * limit }),
      prisma.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*) AS total FROM customers c WHERE ${where}`,
    ]);
    return { items: rows.map(toSummary), total: Number(count[0]?.total ?? 0) };
  },

  async find(id) {
    const [row] = await summaries(Prisma.sql`c.id = ${id}::uuid`, { limit: 1, offset: 0 });
    if (!row) return null;
    const [addresses, orders] = await Promise.all([
      prisma.customerAddress.findMany({
        where: { customerId: id },
        select: { id: true, label: true, landmark: true, zone: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.order.findMany({
        where: { customerId: id },
        select: { id: true, number: true, createdAt: true, total: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return {
      ...toSummary(row),
      addresses: addresses.map((a) => ({ id: a.id, label: a.label, zoneName: a.zone.name, landmark: a.landmark })),
      orders: orders.map((o) => ({ ...o, total: o.total.toNumber() })),
    };
  },
};
