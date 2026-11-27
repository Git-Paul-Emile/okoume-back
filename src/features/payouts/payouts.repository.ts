import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Reversement dû à un vendeur pour une commande qu'un livreur OKOZA a encaissée (cahier des charges 1.2, 32.6).
 * Montants figés à la création, dans la même transaction que l'encaissement (payments.repository.ts).
 */
export interface PayoutRecord {
  id: string;
  shop: { id: string; name: string };
  order: { id: string; number: string };
  collected: number;
  deliveryFee: number;
  commissionRate: number;
  commission: number;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  method: 'cash' | 'airtel' | 'moov' | null;
  reference: string | null;
  paidAt: Date | null;
  /** Membre de l'équipe qui a fait le reversement */
  paidBy: string | null;
  createdAt: Date;
}

export interface PayoutFilters {
  shopId?: string | undefined;
  status?: PayoutRecord['status'] | undefined;
  page: number;
  limit: number;
}

export interface PayoutsRepository {
  /** Reversements du plus récent au plus ancien, avec le total encore dû pour les mêmes critères de boutique */
  list(filters: PayoutFilters): Promise<{ items: PayoutRecord[]; total: number; due: number }>;
}

const include = {
  shop: { select: { id: true, name: true } },
  order: { select: { id: true, number: true } },
  paidBy: { select: { firstName: true, lastName: true } },
} as const satisfies Prisma.SellerPayoutInclude;

const toRecord = (row: Prisma.SellerPayoutGetPayload<{ include: typeof include }>): PayoutRecord => ({
  id: row.id,
  shop: row.shop,
  order: row.order,
  collected: row.collected.toNumber(),
  deliveryFee: row.deliveryFee.toNumber(),
  commissionRate: row.commissionRate.toNumber(),
  commission: row.commission.toNumber(),
  amount: row.amount.toNumber(),
  status: row.status,
  method: row.method,
  reference: row.reference,
  paidAt: row.paidAt,
  paidBy: row.paidBy ? `${row.paidBy.firstName} ${row.paidBy.lastName}` : null,
  createdAt: row.createdAt,
});

export const payoutsRepository: PayoutsRepository = {
  async list({ shopId, status, page, limit }) {
    const where: Prisma.SellerPayoutWhereInput = { ...(shopId ? { shopId } : {}), ...(status ? { status } : {}) };
    const [rows, total, due] = await prisma.$transaction([
      prisma.sellerPayout.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.sellerPayout.count({ where }),
      prisma.sellerPayout.aggregate({
        where: { ...(shopId ? { shopId } : {}), status: 'pending' },
        _sum: { amount: true },
      }),
    ]);
    return { items: rows.map(toRecord), total, due: due._sum.amount?.toNumber() ?? 0 };
  },
};
