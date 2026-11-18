import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export type ReturnStatus = 'pending' | 'refused' | 'expected' | 'received' | 'refund_due' | 'refunded' | 'closed';
export type ReturnActor = { type: 'customer' } | { type: 'staff'; staffId: string };

export interface ReturnItemRecord {
  variantId: string;
  quantity: number;
  resaleable: number | null;
  unsellable: number | null;
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
  inspectionNote: string | null;
  refundAmount: number | null;
  refundedAmount: number;
  restockStatus: 'none' | 'pending' | 'done';
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

export interface InspectionWrite {
  lines: Array<{ variantId: string; resaleable: number; unsellable: number }>;
  note: string;
  refundAmount: number;
  next: 'refund_due' | 'closed';
  /** La commande payée passe en « Remboursement à effectuer » dans la même transaction */
  orderRefundDue: boolean;
}

export type WriteOffResult =
  | { outcome: 'applied'; unsellableLeft: number }
  | { outcome: 'not_found' }
  | { outcome: 'insufficient'; unsellable: number };

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
  /** Inspection : classement des articles, stock non revendable mis à part, montant à rembourser. */
  inspect(ret: ReturnRecord, inspection: InspectionWrite, staffId: string): Promise<ReturnRecord | null>;
  /** Remise en stock des articles revendables, validée par une personne autorisée au stock. */
  restock(ret: ReturnRecord, staffId: string): Promise<ReturnRecord | null>;
  writeOff(
    variantId: string,
    entry: { quantity: number; reason: string; referenceValue: number; occurredAt: Date },
    staffId: string,
  ): Promise<WriteOffResult>;
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
  inspectionNote: row.inspectionNote,
  refundAmount: row.refundAmount?.toNumber() ?? null,
  refundedAmount: row.refundedAmount.toNumber(),
  restockStatus: row.restockStatus,
  reopenRequestedAt: row.reopenRequestedAt,
  items: row.items.map(({ variantId, quantity, resaleable, unsellable }) => ({
    variantId,
    quantity,
    resaleable,
    unsellable,
  })),
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

  inspect: (ret, inspection, staffId) =>
    guarded(async (tx) => {
      const resaleable = inspection.lines.some((l) => l.resaleable > 0);
      await move(tx, ret, inspection.next, {
        inspectionNote: inspection.note,
        refundAmount: inspection.refundAmount,
        restockStatus: resaleable ? 'pending' : 'none',
      });
      for (const line of [...inspection.lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
        await tx.returnItem.update({
          where: { returnId_variantId: { returnId: ret.id, variantId: line.variantId } },
          data: { resaleable: line.resaleable, unsellable: line.unsellable },
          select: { id: true },
        });
        if (!line.unsellable) continue;
        // Non revendable : stock séparé, jamais proposé à la vente ; le journal suit ce compteur
        const [updated] = await tx.$queryRaw<Array<{ unsellable: number }>>`
          UPDATE variants SET unsellable = unsellable + ${line.unsellable} WHERE id = ${line.variantId}::uuid RETURNING unsellable`;
        if (!updated) throw new Error(`Variante introuvable : ${line.variantId}`);
        const after = Number(updated.unsellable);
        await tx.stockMovement.create({
          data: {
            variantId: line.variantId,
            type: 'non_vendable',
            before: after - line.unsellable,
            after,
            delta: line.unsellable,
            reason: `Retour non revendable (${ret.orderNumber}) : stock séparé, hors vente`,
            orderId: ret.orderId,
            staffId,
          },
          select: { id: true },
        });
      }
      if (inspection.orderRefundDue)
        await tx.order.updateMany({
          where: { id: ret.orderId, paymentStatus: 'paid' },
          data: { paymentStatus: 'refund_due' },
        });
      await event(tx, ret.id, inspection.next, inspection.note, { type: 'staff', staffId });
      return ret.id;
    }),

  restock: (ret, staffId) =>
    guarded(async (tx) => {
      const marked = await tx.returnRequest.updateMany({
        where: { id: ret.id, restockStatus: 'pending' },
        data: { restockStatus: 'done' },
      });
      if (marked.count !== 1) throw new StaleReturn();
      for (const item of ret.items) {
        if (!item.resaleable) continue;
        const [updated] = await tx.$queryRaw<Array<{ stock: number }>>`
          UPDATE variants SET stock = stock + ${item.resaleable} WHERE id = ${item.variantId}::uuid RETURNING stock`;
        if (!updated) throw new Error(`Variante introuvable : ${item.variantId}`);
        const after = Number(updated.stock);
        await tx.stockMovement.create({
          data: {
            variantId: item.variantId,
            type: 'retour',
            before: after - item.resaleable,
            after,
            delta: item.resaleable,
            reason: `Retour reçu pour la commande ${ret.orderNumber}`,
            orderId: ret.orderId,
            staffId,
          },
          select: { id: true },
        });
      }
      await event(tx, ret.id, ret.status, 'Articles revendables remis en stock', { type: 'staff', staffId });
      return ret.id;
    }),

  async writeOff(variantId, entry, staffId) {
    return prisma.$transaction(async (tx): Promise<WriteOffResult> => {
      const [variant] = await tx.$queryRaw<Array<{ unsellable: number }>>`
        SELECT unsellable FROM variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      if (!variant) return { outcome: 'not_found' };
      const before = Number(variant.unsellable);
      if (before < entry.quantity) return { outcome: 'insufficient', unsellable: before };
      await tx.variant.update({
        where: { id: variantId },
        data: { unsellable: before - entry.quantity },
        select: { id: true },
      });
      await tx.stockWriteOff.create({ data: { variantId, ...entry, staffId }, select: { id: true } });
      await tx.stockMovement.create({
        data: {
          variantId,
          type: 'mise_au_rebut',
          before,
          after: before - entry.quantity,
          delta: -entry.quantity,
          reason: entry.reason,
          staffId,
        },
        select: { id: true },
      });
      return { outcome: 'applied', unsellableLeft: before - entry.quantity };
    });
  },
};
