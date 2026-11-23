import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export type ReturnStatus = 'pending' | 'refused' | 'expected' | 'received' | 'refund_due' | 'refunded' | 'closed';
export type ReturnActor = { type: 'customer' } | { type: 'staff'; staffId: string };

export interface ReturnItemRecord {
  variantId: string;
  quantity: number;
}

export interface ReturnRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  customerId: string | null;
  status: ReturnStatus;
  reason: string;
  comment: string;
  evidenceUrls: string[];
  decisionReason: string | null;
  shippingPaidBy: 'shop' | 'customer' | null;
  shippingReason: string | null;
  refundAmount: number | null;
  refundedAmount: number;
  reopenRequestedAt: Date | null;
  items: ReturnItemRecord[];
  events: Array<{
    status: ReturnStatus;
    note: string | null;
    actor: 'customer' | 'staff';
    by: string | null;
    createdAt: Date;
  }>;
  createdAt: Date;
}

export interface NewReturn {
  reason: string;
  comment: string;
  evidenceUrls: string[];
  items: Array<{ variantId: string; quantity: number }>;
}

/** Champs que fixe une étape du dossier. */
export type ReturnPatch = Partial<
  Pick<ReturnRecord, 'decisionReason' | 'shippingPaidBy' | 'shippingReason' | 'reopenRequestedAt'>
>;

/** Contrat de stockage des retours. Chaque écriture vérifie l'étape lue : sinon null, rien n'est écrit. */
export interface ReturnsRepository {
  findById(id: string): Promise<ReturnRecord | null>;
  findByOrder(orderId: string): Promise<ReturnRecord | null>;
  list(filters: {
    status?: ReturnStatus | undefined;
    page: number;
    limit: number;
  }): Promise<{ items: ReturnRecord[]; total: number }>;
  /** null : la commande a déjà un dossier de retour. */
  create(orderId: string, request: NewReturn): Promise<ReturnRecord | null>;
  transition(
    ret: ReturnRecord,
    to: ReturnStatus,
    patch: ReturnPatch,
    note: string,
    actor: ReturnActor,
  ): Promise<ReturnRecord | null>;
  /** Réception simple : fixe le montant dû et ouvre directement le remboursement après réception. */
  receive(
    ret: ReturnRecord,
    input: { refundAmount: number; next: 'refund_due' | 'closed'; note: string },
    staffId: string,
  ): Promise<ReturnRecord | null>;
}

const include = {
  order: { select: { number: true, customerId: true } },
  items: { orderBy: { variantId: 'asc' } },
  events: { orderBy: { createdAt: 'asc' }, include: { staff: { select: { firstName: true, lastName: true } } } },
} as const satisfies Prisma.ReturnRequestInclude;

type Row = Prisma.ReturnRequestGetPayload<{ include: typeof include }>;

const toRecord = (row: Row): ReturnRecord => ({
  id: row.id,
  orderId: row.orderId,
  orderNumber: row.order.number,
  customerId: row.order.customerId,
  status: row.status,
  reason: row.reason,
  comment: row.comment,
  evidenceUrls: row.evidenceUrls,
  decisionReason: row.decisionReason,
  shippingPaidBy: row.shippingPaidBy,
  shippingReason: row.shippingReason,
  refundAmount: row.refundAmount?.toNumber() ?? null,
  refundedAmount: row.refundedAmount.toNumber(),
  reopenRequestedAt: row.reopenRequestedAt,
  items: row.items.map(({ variantId, quantity }) => ({ variantId, quantity })),
  events: row.events.map((e) => ({
    status: e.status,
    note: e.note,
    actor: e.actor === 'staff' ? 'staff' : 'customer',
    by: e.staff ? `${e.staff.firstName} ${e.staff.lastName}` : null,
    createdAt: e.createdAt,
  })),
  createdAt: row.createdAt,
});

type Tx = Prisma.TransactionClient;

class StaleReturn extends Error {}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Étape gardée : le dossier n'avance que s'il est encore à l'étape lue. */
async function move(tx: Tx, ret: ReturnRecord, to: ReturnStatus, data: Prisma.ReturnRequestUpdateManyMutationInput) {
  const moved = await tx.returnRequest.updateMany({
    where: { id: ret.id, status: ret.status },
    data: { ...data, status: to },
  });
  if (moved.count !== 1) throw new StaleReturn();
}

const event = (tx: Tx, returnId: string, status: ReturnStatus, note: string, actor: ReturnActor) =>
  tx.returnEvent.create({
    data: { returnId, status, note, actor: actor.type, staffId: actor.type === 'staff' ? actor.staffId : null },
    select: { id: true },
  });

async function guarded(work: (tx: Tx) => Promise<string>): Promise<ReturnRecord | null> {
  try {
    const id = await prisma.$transaction(work);
    return toRecord(await prisma.returnRequest.findUniqueOrThrow({ where: { id }, include }));
  } catch (error) {
    if (error instanceof StaleReturn) return null;
    throw error;
  }
}

export const returnsRepository: ReturnsRepository = {
  async findById(id) {
    const row = await prisma.returnRequest.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  },

  async findByOrder(orderId) {
    const row = await prisma.returnRequest.findUnique({ where: { orderId }, include });
    return row ? toRecord(row) : null;
  },

  async list({ status, page, limit }) {
    const where = status ? { status } : {};
    const [rows, total] = await prisma.$transaction([
      prisma.returnRequest.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.returnRequest.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  },

  async create(orderId, { items, ...fields }) {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.returnRequest.create({
          data: { orderId, ...fields, items: { create: items } },
          select: { id: true },
        });
        await event(tx, created.id, 'pending', 'Demande de retour envoyée', { type: 'customer' });
        return tx.returnRequest.findUniqueOrThrow({ where: { id: created.id }, include });
      });
      return toRecord(row);
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  transition: (ret, to, patch, note, actor) =>
    guarded(async (tx) => {
      await move(tx, ret, to, patch);
      await event(tx, ret.id, to, note, actor);
      return ret.id;
    }),

  receive: (ret, input, staffId) =>
    guarded(async (tx) => {
      await move(tx, ret, input.next, { refundAmount: input.refundAmount });
      if (input.next === 'refund_due') {
        const updated = await tx.order.updateMany({
          where: { id: ret.orderId, paymentStatus: 'paid' },
          data: { paymentStatus: 'refund_due' },
        });
        if (updated.count !== 1) throw new StaleReturn();
      }
      await event(tx, ret.id, input.next, input.note, { type: 'staff', staffId });
      return ret.id;
    }),
};
