import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { creditEarnedPoints, earnedForOrder, reversePoints } from '../loyalty/loyalty.repository.js';
import { rewardFirstOrder } from '../loyalty-rewards/loyalty-rewards.repository.js';
import { DAY_MS, HISTORY_DAYS, type RiskHistory } from './orders.risk.js';

export type OrderStatus =
  'confirmed' | 'preparing' | 'ready' | 'courier_assigned' | 'shipping' | 'delivered' | 'cancelled' | 'claim';
export type PaymentStatus = 'awaiting_payment' | 'awaiting_verification' | 'paid' | 'refund_due' | 'refunded';
export type PaymentMethod = 'cash' | 'airtel' | 'moov';

export interface OrderTotals {
  subtotal: number;
  productDiscount: number;
  codeDiscount: number;
  pointsDiscount: number;
  deliveryFee: number;
  deliveryDiscount: number;
  total: number;
}

export interface OrderItemRecord {
  productId: string;
  variantId: string;
  name: string;
  variantLabel: string;
  image: string;
  unitPrice: number;
  originalPrice: number;
  vatRate: number;
  quantity: number;
}

export interface OrderEventRecord {
  status: OrderStatus;
  fromStatus: OrderStatus | null;
  note: string | null;
  actor: 'customer' | 'staff' | 'system';
  /** Prénom et nom du membre de l'équipe auteur de l'étape */
  by: string | null;
  createdAt: Date;
}

/** Demande de changement des frais facturés, en attente de l'accord du client (9.5). */
export interface FeeChangeRecord {
  id: string;
  fromFee: number;
  toFee: number;
  reason: string;
  status: 'pending' | 'accepted' | 'refused';
  createdAt: Date;
}

/** Contestation d'une livraison marquée « Livrée » (9.6). */
export interface DisputeRecord {
  id: string;
  reason: string;
  status: 'open' | 'resolved';
  resolution: string | null;
  createdAt: Date;
}

export interface CancellationRecord {
  reason: string;
  comment: string;
  status: 'pending' | 'accepted' | 'refused';
  decisionReason: string | null;
  createdAt: Date;
}

export interface OrderRecord {
  id: string;
  number: string;
  trackingCode: string;
  customerId: string | null;
  idempotencyKey: string;
  recipient: string;
  phone: string;
  email: string;
  zoneId: string;
  zoneName: string;
  landmark: string;
  /** Consignes pour le livreur, vide si aucune */
  instructions: string;
  totals: OrderTotals;
  promoCode: string | null;
  promoCodeId: string | null;
  pointsUsed: number;
  courierId: string | null;
  /** Coût réel de la course pour la boutique ; null tant qu'il n'est pas renseigné */
  deliveryCost: number | null;
  /** Dernière demande de changement des frais, et dernière contestation */
  feeChange: FeeChangeRecord | null;
  dispute: DisputeRecord | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** Paiement Mobile Money déclaré par le client (référence de la transaction), en attente de vérification */
  paymentDeclaration: { reference: string; at: Date } | null;
  /** Vérification anti-fraude (19.3) : null si aucun signal n'a été levé à la création */
  review: OrderReviewRecord | null;
  status: OrderStatus;
  items: OrderItemRecord[];
  events: OrderEventRecord[];
  cancellation: CancellationRecord | null;
  createdAt: Date;
}

export interface OrderReviewRecord {
  status: 'pending' | 'cleared';
  reasons: string[];
  note: string | null;
  by: string | null;
  at: Date | null;
}

export type NewOrder = Omit<
  OrderRecord,
  | 'id'
  | 'events'
  | 'cancellation'
  | 'createdAt'
  | 'status'
  | 'courierId'
  | 'deliveryCost'
  | 'feeChange'
  | 'dispute'
  | 'paymentDeclaration'
  | 'review'
> & {
  /** Clé du téléphone (8 derniers chiffres), pour rapprocher les commandes d'un même numéro */
  phoneKey: string;
  /** Signaux levés ; non vide : la commande attend une vérification avant la préparation */
  reviewReasons: string[];
  reviewStatus: 'pending' | null;
};

/** Auteur d'un changement : le client, un membre de l'équipe, ou un traitement automatique. */
export type OrderActor = { type: 'customer' } | { type: 'staff'; staffId: string } | { type: 'system' };

/** Changement d'état à appliquer (calculé par orders.transitions.ts). */
export interface AppliedTransition {
  from: OrderStatus;
  to: OrderStatus;
  paymentStatus?: PaymentStatus | undefined;
  note?: string | undefined;
  stock: 'consume' | 'release' | 'restock' | null;
  /** Livreur affecté avec le coût réel de la course ; null : livreur retiré ; absent : inchangé */
  courier?: { id: string; deliveryCost: number | null } | null | undefined;
}

/** « stale » : la commande a changé entre la lecture et l'écriture, rien n'a été appliqué. */
export type TransitionResult = { outcome: 'applied'; order: OrderRecord } | { outcome: 'stale' };

export interface StaffOrderFilters {
  status?: OrderStatus | undefined;
  /** pending : commandes signalées en attente de vérification */
  review?: 'pending' | undefined;
  paymentMethod?: PaymentMethod | undefined;
  paymentStatus?: PaymentStatus | undefined;
  /** Numéro de commande, nom du destinataire ou téléphone */
  search?: string | undefined;
  sort: { field: 'createdAt' | 'total'; direction: 'asc' | 'desc' };
  page: number;
  limit: number;
}

/** Issue d'une création : la transaction n'a rien écrit si ce n'est pas « created ». */
export type CreateOrderResult =
  | { outcome: 'created'; order: OrderRecord }
  | { outcome: 'out_of_stock'; shortages: Array<{ variantId: string; available: number }> }
  | { outcome: 'duplicate_request' }
  | { outcome: 'number_taken' }
  /** Code épuisé ou limite par client atteinte entre le calcul et l'écriture */
  | { outcome: 'promo_unavailable' }
  /** Solde de points devenu insuffisant entre le calcul et l'écriture */
  | { outcome: 'points_unavailable' };

/** Contrat de stockage des commandes. */
export interface OrdersRepository {
  create(order: NewOrder): Promise<CreateOrderResult>;
  findByIdempotencyKey(key: string): Promise<OrderRecord | null>;
  findForCustomer(id: string, customerId: string): Promise<OrderRecord | null>;
  listForCustomer(
    customerId: string,
    since: Date,
    page: { page: number; limit: number },
    number?: string,
  ): Promise<{ items: OrderRecord[]; total: number }>;
  findById(id: string): Promise<OrderRecord | null>;
  findByNumber(number: string): Promise<OrderRecord | null>;
  listForStaff(filters: StaffOrderFilters): Promise<{ items: OrderRecord[]; total: number }>;
  /** Applique un changement d'état, ses effets sur le stock et l'étape d'historique, ensemble ou pas du tout. */
  applyTransition(order: OrderRecord, change: AppliedTransition, actor: OrderActor): Promise<TransitionResult>;
  /** Enregistre la demande d'annulation du client ; false si la commande en a déjà une. */
  requestCancellation(orderId: string, request: { reason: string; comment: string }): Promise<boolean>;
  /**
   * Décision de l'équipe sur une demande en attente. Acceptée : la transition d'annulation est appliquée
   * dans la même transaction. false si la demande n'est plus en attente.
   */
  setDeliveryCost(orderId: string, cost: number): Promise<OrderRecord | null>;
  /** false : une demande est déjà en attente. */
  proposeFeeChange(order: OrderRecord, change: { toFee: number; reason: string; staffId: string }): Promise<boolean>;
  /** Décision du client : acceptée, les frais et le total changent dans la même transaction. */
  decideFeeChange(order: OrderRecord, accept: boolean, at: Date): Promise<TransitionResult>;
  /** false : une contestation est déjà ouverte. */
  openDispute(orderId: string, reason: string): Promise<boolean>;
  /**
   * Paiement Mobile Money déclaré : la commande passe « à vérifier » avec la référence. false si elle n'attend
   * plus de paiement (déjà déclaré, payé ou annulé) : la condition est vérifiée dans la même écriture.
   */
  declarePayment(orderId: string, reference: string, at: Date): Promise<boolean>;
  /** Historique d'un numéro de téléphone avant une nouvelle commande (signaux anti-fraude) */
  riskHistory(phoneKey: string, email: string, at: Date): Promise<RiskHistory>;
  /** Seuil de montant au-delà duquel une commande est vérifiée (paramètres de la boutique) */
  reviewThreshold(): Promise<number>;
  /** Vérification faite : false si la commande n'attendait pas de vérification */
  clearReview(orderId: string, review: { note: string; staffId: string; at: Date }): Promise<boolean>;
  /** Rattache une commande passée sans compte ; false si elle a déjà un compte (vérifié dans la même écriture). */
  claim(orderId: string, customerId: string): Promise<boolean>;
  resolveDispute(orderId: string, resolution: string, staffId: string, at: Date): Promise<boolean>;
  decideCancellation(
    order: OrderRecord,
    decision: { accept: boolean; reason: string; staffId: string; at: Date },
    cancellation: AppliedTransition | null,
  ): Promise<TransitionResult>;
}

const include = {
  items: true,
  events: { orderBy: { createdAt: 'asc' }, include: { staff: { select: { firstName: true, lastName: true } } } },
  cancellation: true,
  feeChanges: { orderBy: { createdAt: 'desc' }, take: 1 },
  disputes: { orderBy: { createdAt: 'desc' }, take: 1 },
} as const satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof include }>;

const toRecord = (row: OrderRow): OrderRecord => ({
  id: row.id,
  number: row.number,
  trackingCode: row.trackingCode,
  customerId: row.customerId,
  idempotencyKey: row.idempotencyKey,
  recipient: row.recipient,
  phone: row.phone,
  email: row.email,
  zoneId: row.zoneId,
  zoneName: row.zoneName,
  landmark: row.landmark,
  instructions: row.instructions,
  totals: {
    subtotal: row.subtotal.toNumber(),
    productDiscount: row.productDiscount.toNumber(),
    codeDiscount: row.codeDiscount.toNumber(),
    pointsDiscount: row.pointsDiscount.toNumber(),
    deliveryFee: row.deliveryFee.toNumber(),
    deliveryDiscount: row.deliveryDiscount.toNumber(),
    total: row.total.toNumber(),
  },
  promoCode: row.promoCode,
  promoCodeId: row.promoCodeId,
  pointsUsed: row.pointsUsed,
  courierId: row.courierId,
  deliveryCost: row.deliveryCost?.toNumber() ?? null,
  feeChange: row.feeChanges[0]
    ? {
        id: row.feeChanges[0].id,
        fromFee: row.feeChanges[0].fromFee.toNumber(),
        toFee: row.feeChanges[0].toFee.toNumber(),
        reason: row.feeChanges[0].reason,
        status: row.feeChanges[0].status,
        createdAt: row.feeChanges[0].createdAt,
      }
    : null,
  dispute: row.disputes[0]
    ? {
        id: row.disputes[0].id,
        reason: row.disputes[0].reason,
        status: row.disputes[0].status,
        resolution: row.disputes[0].resolution,
        createdAt: row.disputes[0].createdAt,
      }
    : null,
  paymentMethod: row.paymentMethod,
  paymentStatus: row.paymentStatus,
  review: row.reviewStatus
    ? {
        status: row.reviewStatus,
        reasons: row.reviewReasons,
        note: row.reviewNote,
        by: row.reviewedBy,
        at: row.reviewedAt,
      }
    : null,
  paymentDeclaration:
    row.paymentReference && row.paymentDeclaredAt
      ? { reference: row.paymentReference, at: row.paymentDeclaredAt }
      : null,
  status: row.status,
  items: row.items.map((i) => ({
    productId: i.productId,
    variantId: i.variantId,
    name: i.name,
    variantLabel: i.variantLabel,
    image: i.image,
    unitPrice: i.unitPrice.toNumber(),
    originalPrice: i.originalPrice.toNumber(),
    vatRate: i.vatRate.toNumber(),
    quantity: i.quantity,
  })),
  events: row.events.map((e) => ({
    status: e.status,
    fromStatus: e.fromStatus,
    note: e.note,
    actor: e.actor,
    by: e.staff ? `${e.staff.firstName} ${e.staff.lastName}` : null,
    createdAt: e.createdAt,
  })),
  cancellation: row.cancellation && {
    reason: row.cancellation.reason,
    comment: row.cancellation.comment,
    status: row.cancellation.status,
    decisionReason: row.cancellation.decisionReason,
    createdAt: row.cancellation.createdAt,
  },
  createdAt: row.createdAt,
});

/** Code épuisé ou limite par client atteinte : la transaction est annulée. */
class PromoUnavailable extends Error {}

/** Solde de points insuffisant au moment d'écrire : la transaction est annulée. */
class PointsUnavailable extends Error {}

/** Levée dans la transaction pour l'annuler entièrement quand un article manque. */
class OutOfStock extends Error {
  constructor(readonly shortages: Array<{ variantId: string; available: number }>) {
    super('Stock insuffisant');
  }
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export const ordersRepository: OrdersRepository = {
  /**
   * Réservation du stock et création de la commande dans une seule transaction. Les variantes sont
   * verrouillées (FOR UPDATE) dans un ordre fixe : deux commandes simultanées sur le même article
   * passent l'une après l'autre, sans survente ni interblocage.
   */
  async create(order) {
    const quantities = new Map<string, number>();
    for (const item of order.items)
      quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
    const variantIds = [...quantities.keys()].sort();

    try {
      const created = await prisma.$transaction(async (tx) => {
        // Les commandes d'un même client passent l'une après l'autre : limite par client et solde de points exacts
        if (order.customerId)
          await tx.$queryRaw`SELECT id FROM customers WHERE id = ${order.customerId}::uuid FOR UPDATE`;
        if (order.promoCodeId) await usePromoCode(tx, order.promoCodeId, order.customerId);
        if (order.pointsUsed > 0) {
          const balance = await tx.loyaltyMovement.aggregate({
            where: { customerId: order.customerId ?? '' },
            _sum: { points: true },
          });
          if ((balance._sum.points ?? 0) < order.pointsUsed) throw new PointsUnavailable();
        }

        const locked = await tx.$queryRaw<Array<{ id: string; available: number }>>`
          SELECT id, stock - reserved AS available FROM variants
          WHERE id = ANY(${variantIds}::uuid[]) ORDER BY id FOR UPDATE`;
        const available = new Map(locked.map((v) => [v.id, Number(v.available)] as const));
        const shortages = variantIds
          .map((variantId) => ({ variantId, available: available.get(variantId) ?? 0 }))
          .filter(({ variantId, available: left }) => left < (quantities.get(variantId) ?? 0));
        if (shortages.length) throw new OutOfStock(shortages);

        for (const [id, quantity] of quantities)
          await tx.variant.update({ where: { id }, data: { reserved: { increment: quantity } }, select: { id: true } });

        const { totals, items, ...fields } = order;
        const row = await tx.order.create({
          data: {
            ...fields,
            ...totals,
            status: 'confirmed',
            items: { create: items },
            events: { create: { status: 'confirmed', actor: order.customerId ? 'customer' : 'system' } },
          },
          include,
        });
        if (order.pointsUsed > 0 && order.customerId)
          await tx.loyaltyMovement.create({
            data: {
              customerId: order.customerId,
              points: -order.pointsUsed,
              type: 'redeem',
              label: `Points utilisés sur la commande ${order.number}`,
              orderId: row.id,
            },
            select: { id: true },
          });
        return row;
      });
      return { outcome: 'created', order: toRecord(created) };
    } catch (error) {
      if (error instanceof OutOfStock) return { outcome: 'out_of_stock', shortages: error.shortages };
      if (error instanceof PromoUnavailable) return { outcome: 'promo_unavailable' };
      if (error instanceof PointsUnavailable) return { outcome: 'points_unavailable' };
      if (isUniqueViolation(error)) {
        // Deux contraintes uniques possibles : la clé d'idempotence (requête rejouée) ou le numéro tiré au hasard
        const replay = await prisma.order.findUnique({
          where: { idempotencyKey: order.idempotencyKey },
          select: { id: true },
        });
        return { outcome: replay ? 'duplicate_request' : 'number_taken' };
      }
      throw error;
    }
  },

  async findByIdempotencyKey(idempotencyKey) {
    const row = await prisma.order.findUnique({ where: { idempotencyKey }, include });
    return row ? toRecord(row) : null;
  },

  async findForCustomer(id, customerId) {
    const row = await prisma.order.findFirst({ where: { id, customerId }, include });
    return row ? toRecord(row) : null;
  },

  async listForCustomer(customerId, since, { page, limit }, number) {
    const where = { customerId, createdAt: { gte: since }, ...(number ? { number } : {}) };
    const [rows, total] = await prisma.$transaction([
      prisma.order.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.order.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  },

  async findById(id) {
    const row = await prisma.order.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  },

  async findByNumber(number) {
    const row = await prisma.order.findUnique({ where: { number }, include });
    return row ? toRecord(row) : null;
  },

  async listForStaff({ status, review, paymentMethod, paymentStatus, search, sort, page, limit }) {
    const where: Prisma.OrderWhereInput = {
      ...(status ? { status } : {}),
      ...(review ? { reviewStatus: review } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { recipient: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search.replace(/\s/g, '') } },
            ],
          }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include,
        orderBy: [{ [sort.field]: sort.direction }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  },

  async applyTransition(order, change, actor) {
    try {
      const row = await prisma.$transaction(async (tx) => {
        await applyInTransaction(tx, order, change, actor);
        return tx.order.findUniqueOrThrow({ where: { id: order.id }, include });
      });
      return { outcome: 'applied', order: toRecord(row) };
    } catch (error) {
      if (error instanceof StaleOrder) return { outcome: 'stale' };
      throw error;
    }
  },

  async setDeliveryCost(orderId, cost) {
    const updated = await prisma.order.updateMany({ where: { id: orderId }, data: { deliveryCost: cost } });
    return updated.count === 1 ? ordersRepository.findById(orderId) : null;
  },

  async proposeFeeChange(order, { toFee, reason, staffId }) {
    try {
      await prisma.deliveryFeeChange.create({
        data: {
          orderId: order.id,
          fromFee: order.totals.deliveryFee - order.totals.deliveryDiscount,
          toFee,
          reason,
          staffId,
        },
        select: { id: true },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  },

  /** Acceptée : frais et total ajustés de l'écart, rien n'est encaissé entre-temps (garde sur le statut de paiement). */
  async decideFeeChange(order, accept, at) {
    const change = order.feeChange;
    if (!change || change.status !== 'pending') return { outcome: 'stale' };
    try {
      const row = await prisma.$transaction(async (tx) => {
        const decided = await tx.deliveryFeeChange.updateMany({
          where: { id: change.id, status: 'pending' },
          data: { status: accept ? 'accepted' : 'refused', decidedAt: at },
        });
        if (decided.count !== 1) throw new StaleOrder();
        if (accept) {
          const diff = change.toFee - change.fromFee;
          const moved = await tx.order.updateMany({
            where: { id: order.id, paymentStatus: 'awaiting_payment', status: order.status },
            data: { deliveryFee: { increment: diff }, total: { increment: diff } },
          });
          if (moved.count !== 1) throw new StaleOrder();
        }
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            status: order.status,
            fromStatus: order.status,
            note: accept
              ? `Nouveaux frais de livraison acceptés par le client : ${change.toFee} FCFA`
              : `Nouveaux frais de livraison refusés par le client (${change.toFee} FCFA)`,
            actor: 'customer',
          },
          select: { id: true },
        });
        return tx.order.findUniqueOrThrow({ where: { id: order.id }, include });
      });
      return { outcome: 'applied', order: toRecord(row) };
    } catch (error) {
      if (error instanceof StaleOrder) return { outcome: 'stale' };
      throw error;
    }
  },

  async riskHistory(phoneKey, email, at) {
    const day = new Date(at.getTime() - DAY_MS);
    const month = new Date(at.getTime() - HISTORY_DAYS * DAY_MS);
    const [recentOrders, cancelledOrders, emails] = await prisma.$transaction([
      prisma.order.count({ where: { phoneKey, createdAt: { gte: day } } }),
      prisma.order.count({ where: { phoneKey, status: 'cancelled', createdAt: { gte: month } } }),
      prisma.order.findMany({
        where: { phoneKey, createdAt: { gte: month }, NOT: { email: { equals: email, mode: 'insensitive' } } },
        distinct: ['email'],
        select: { email: true },
      }),
    ]);
    return { recentOrders, cancelledOrders, otherEmails: emails.length };
  },

  async reviewThreshold() {
    const settings = await prisma.shopInformation.findUnique({ where: { id: 1 }, select: { reviewAmount: true } });
    return settings?.reviewAmount ?? 0;
  },

  async clearReview(orderId, { note, staffId, at }) {
    // Nom figé au moment de la vérification, comme dans le journal d'activité
    const member = await prisma.staffMember.findUnique({
      where: { id: staffId },
      select: { firstName: true, lastName: true },
    });
    const by = member ? member.firstName + ' ' + member.lastName : 'Équipe';
    const updated = await prisma.order.updateMany({
      where: { id: orderId, reviewStatus: 'pending' },
      data: { reviewStatus: 'cleared', reviewNote: note, reviewedBy: by, reviewedAt: at },
    });
    return updated.count === 1;
  },

  async claim(orderId, customerId) {
    const updated = await prisma.order.updateMany({ where: { id: orderId, customerId: null }, data: { customerId } });
    return updated.count === 1;
  },

  async declarePayment(orderId, reference, at) {
    const updated = await prisma.order.updateMany({
      where: {
        id: orderId,
        paymentStatus: 'awaiting_payment',
        paymentMethod: { not: 'cash' },
        status: { not: 'cancelled' },
      },
      data: { paymentStatus: 'awaiting_verification', paymentReference: reference, paymentDeclaredAt: at },
    });
    return updated.count === 1;
  },

  async openDispute(orderId, reason) {
    try {
      await prisma.deliveryDispute.create({ data: { orderId, reason }, select: { id: true } });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  },

  async resolveDispute(orderId, resolution, staffId, at) {
    const resolved = await prisma.deliveryDispute.updateMany({
      where: { orderId, status: 'open' },
      data: { status: 'resolved', resolution, staffId, resolvedAt: at },
    });
    return resolved.count === 1;
  },

  async requestCancellation(orderId, request) {
    try {
      await prisma.cancellationRequest.create({ data: { orderId, ...request }, select: { id: true } });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  },

  async decideCancellation(order, { accept, reason, staffId, at }, cancellation) {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const decided = await tx.cancellationRequest.updateMany({
          where: { orderId: order.id, status: 'pending' },
          data: {
            status: accept ? 'accepted' : 'refused',
            decisionReason: reason,
            decidedById: staffId,
            decidedAt: at,
          },
        });
        if (decided.count !== 1) throw new StaleOrder();
        if (cancellation) await applyInTransaction(tx, order, cancellation, { type: 'staff', staffId });
        return tx.order.findUniqueOrThrow({ where: { id: order.id }, include });
      });
      return { outcome: 'applied', order: toRecord(row) };
    } catch (error) {
      if (error instanceof StaleOrder) return { outcome: 'stale' };
      throw error;
    }
  },
};

/** La commande a changé depuis sa lecture (autre membre de l'équipe, autre onglet) : tout est annulé. */
class StaleOrder extends Error {}

type Tx = Prisma.TransactionClient;

const STOCK_REASON = {
  consume: (number: string) => `Préparation de la commande ${number}`,
  restock: (number: string) => `Annulation de la commande ${number} après préparation`,
};

/**
 * Cœur d'une transition : l'état n'est changé que s'il vaut encore celui lu (garde « from »), puis le stock
 * suit, variante par variante, avec une mise à jour conditionnelle. Une condition non remplie signale une
 * incohérence : l'erreur annule toute la transaction.
 */
async function applyInTransaction(tx: Tx, order: OrderRecord, change: AppliedTransition, actor: OrderActor) {
  const moved = await tx.order.updateMany({
    where: { id: order.id, status: change.from },
    data: {
      status: change.to,
      ...(change.paymentStatus ? { paymentStatus: change.paymentStatus } : {}),
      ...(change.courier === null ? { courierId: null } : {}),
      ...(change.courier ? { courierId: change.courier.id, deliveryCost: change.courier.deliveryCost } : {}),
    },
  });
  if (moved.count !== 1) throw new StaleOrder();

  const staffId = actor.type === 'staff' ? actor.staffId : null;
  await tx.orderEvent.create({
    data: {
      orderId: order.id,
      status: change.to,
      fromStatus: change.from,
      note: change.note ?? null,
      actor: actor.type,
      staffId,
    },
    select: { id: true },
  });

  if (change.to === 'cancelled') await undoOrderAdvantages(tx, order);
  // Livrée et payée : points crédités, puis bienvenue et parrainage si c'est la première (sans effet sinon)
  await creditEarnedPoints(tx, order.id);
  await rewardFirstOrder(tx, order.id);

  if (!change.stock) return;
  const quantities = new Map<string, number>();
  for (const item of order.items) quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);

  // Ordre fixe des variantes, comme à la création : pas d'interblocage entre deux transactions
  for (const variantId of [...quantities.keys()].sort()) {
    const quantity = quantities.get(variantId) ?? 0;
    if (change.stock === 'release') {
      const released = await tx.$executeRaw`
        UPDATE variants SET reserved = reserved - ${quantity} WHERE id = ${variantId}::uuid AND reserved >= ${quantity}`;
      if (released !== 1) throw new Error(`Réservation incohérente pour la variante ${variantId}`);
      continue;
    }
    const [updated] =
      change.stock === 'consume'
        ? await tx.$queryRaw<Array<{ stock: number }>>`
            UPDATE variants SET stock = stock - ${quantity}, reserved = reserved - ${quantity}
            WHERE id = ${variantId}::uuid AND reserved >= ${quantity} RETURNING stock`
        : await tx.$queryRaw<Array<{ stock: number }>>`
            UPDATE variants SET stock = stock + ${quantity} WHERE id = ${variantId}::uuid RETURNING stock`;
    if (!updated) throw new Error(`Stock incohérent pour la variante ${variantId}`);
    const after = Number(updated.stock);
    const delta = change.stock === 'consume' ? -quantity : quantity;
    await tx.stockMovement.create({
      data: {
        variantId,
        type: change.stock === 'consume' ? 'commande' : 'annulation',
        before: after - delta,
        after,
        delta,
        reason: STOCK_REASON[change.stock](order.number),
        orderId: order.id,
        staffId,
      },
      select: { id: true },
    });
  }
}

/**
 * Usage d'un code dans la transaction de commande : le compteur n'augmente que si la limite totale le permet,
 * et la limite par client est recomptée alors que le compte du client est verrouillé.
 */
async function usePromoCode(tx: Tx, promoCodeId: string, customerId: string | null) {
  const [promo] = await tx.$queryRaw<Array<{ per_customer: number | null }>>`
    UPDATE promo_codes SET uses = uses + 1
    WHERE id = ${promoCodeId}::uuid AND active AND (max_uses IS NULL OR uses < max_uses)
    RETURNING per_customer`;
  if (!promo) throw new PromoUnavailable();
  if (promo.per_customer !== null && customerId) {
    const used = await tx.order.count({ where: { promoCodeId, customerId, status: { not: 'cancelled' } } });
    if (used >= promo.per_customer) throw new PromoUnavailable();
  }
}

/**
 * Annulation : le code redevient disponible, les points utilisés sont rendus et les points déjà gagnés
 * (commande rouverte après livraison) sont retirés. Les index partiels empêchent tout doublon.
 */
async function undoOrderAdvantages(tx: Tx, order: OrderRecord) {
  if (order.promoCodeId)
    await tx.$executeRaw`UPDATE promo_codes SET uses = GREATEST(uses - 1, 0) WHERE id = ${order.promoCodeId}::uuid`;
  if (!order.customerId) return;
  if (order.pointsUsed > 0)
    await tx.$executeRaw`
      INSERT INTO loyalty_movements (id, customer_id, points, type, label, order_id, created_at)
      VALUES (gen_random_uuid(), ${order.customerId}::uuid, ${order.pointsUsed}, 'restore',
              ${`Points rendus : commande ${order.number} annulée`}, ${order.id}::uuid, CURRENT_TIMESTAMP)
      ON CONFLICT (order_id) WHERE type = 'restore' DO NOTHING`;
  const earned = await earnedForOrder(tx, order.id);
  await reversePoints(tx, {
    customerId: order.customerId,
    orderId: order.id,
    points: earned,
    label: `Points retirés : commande ${order.number} annulée`,
  });
}
