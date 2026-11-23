import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
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
  actor: 'customer' | 'staff' | 'system' | 'seller';
  /** Prénom et nom du membre de l'équipe auteur de l'étape */
  by: string | null;
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
  dispute: DisputeRecord | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** Vérification anti-fraude (19.3) : null si aucun signal n'a été levé à la création */
  review: OrderReviewRecord | null;
  status: OrderStatus;
  items: OrderItemRecord[];
  events: OrderEventRecord[];
  cancellation: CancellationRecord | null;
  /** Boutique du vendeur qui a reçu la commande (32.4) ; null pour la boutique OKOZA */
  shopId: string | null;
  shop: { id: string; slug: string; name: string; city?: string; district?: string; phone?: string } | null;
  /** Passage en caisse commun aux commandes d'un même panier ; null si le panier ne venait que d'une boutique */
  checkoutNumber: string | null;
  /** Qui livre (32.5), figé à la commande */
  fulfilledBy: 'okoza' | 'seller';
  /** Confirmation de remise au livreur central pour cet arrêt de la tournée */
  collectionConfirmedAt: Date | null;
  collectionConfirmedBy: string | null;
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
  | 'dispute'
  | 'review'
  | 'shop'
  | 'collectionConfirmedAt'
  | 'collectionConfirmedBy'
> & {
  /** Clé du téléphone (8 derniers chiffres), pour rapprocher les commandes d'un même numéro */
  phoneKey: string;
  /** Signaux levés ; non vide : la commande attend une vérification avant la préparation */
  reviewReasons: string[];
  reviewStatus: 'pending' | null;
};

/** Auteur d'un changement : le client, un membre de l'équipe, ou un traitement automatique. */
export type OrderActor =
  | { type: 'customer' }
  | { type: 'staff'; staffId: string }
  | { type: 'system' }
  /** Vendeur de la boutique qui a reçu la commande (32.4) */
  | { type: 'seller' };

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
export type RouteUpdateResult = { outcome: 'applied'; orders: OrderRecord[] } | { outcome: 'stale' };

export interface StaffOrderFilters {
  status?: OrderStatus | undefined;
  /** pending : commandes signalées en attente de vérification */
  review?: 'pending' | undefined;
  paymentMethod?: PaymentMethod | undefined;
  paymentStatus?: PaymentStatus | undefined;
  /** Numéro de commande, nom du destinataire ou téléphone */
  search?: string | undefined;
  /** Identifiant d'une boutique de vendeur, ou « okoza » pour les commandes de la boutique OKOZA */
  shopId?: string | undefined;
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
  /** Code épuisé entre le calcul et l'écriture */
  | { outcome: 'promo_unavailable' }

/** Issue de la création des commandes d'un même panier : toutes, ou aucune. */
export type CreateCheckoutResult =
  { outcome: 'created'; orders: OrderRecord[] } | Exclude<CreateOrderResult, { outcome: 'created' }>;

/** Contrat de stockage des commandes. */
export interface OrdersRepository {
  create(order: NewOrder): Promise<CreateOrderResult>;
  /** Commandes d'un même panier, une par boutique (32.4), écrites dans une seule transaction. */
  createCheckout(orders: NewOrder[]): Promise<CreateCheckoutResult>;
  /** Commandes d'un même passage en caisse, dans l'ordre de création */
  findByCheckout(checkoutNumber: string): Promise<OrderRecord[]>;
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
  /** Affecte un seul livreur à toutes les sous-commandes de la tournée centralisée, dans une transaction. */
  applyCentralRouteTransition(order: OrderRecord, change: AppliedTransition, actor: OrderActor): Promise<RouteUpdateResult>;
  /** Confirme un arrêt de collecte ; la tournée passe en livraison quand tous les arrêts sont confirmés. */
  confirmCentralCollection(
    order: OrderRecord,
    by: string,
    actor: OrderActor,
    at: Date,
  ): Promise<RouteUpdateResult>;
  /** Enregistre la demande d'annulation du client ; false si la commande en a déjà une. */
  requestCancellation(orderId: string, request: { reason: string; comment: string }): Promise<boolean>;
  /** Enregistre le coût réel de livraison pour les calculs de marge. */
  setDeliveryCost(orderId: string, cost: number): Promise<OrderRecord | null>;
  /** false : une contestation est déjà ouverte. */
  openDispute(orderId: string, reason: string): Promise<boolean>;
  /** Historique d'un numéro de téléphone avant une nouvelle commande (signaux anti-fraude) */
  riskHistory(phoneKey: string, email: string, at: Date): Promise<RiskHistory>;
  /** Seuil de montant au-delà duquel une commande est vérifiée (paramètres de la boutique) */
  reviewThreshold(): Promise<number>;
  /** Vérification faite : false si la commande n'attendait pas de vérification */
  clearReview(orderId: string, review: { note: string; staffId: string; at: Date }): Promise<boolean>;
  /** Rattache une commande passée sans compte ; false si elle a déjà un compte (vérifié dans la même écriture). */
  claim(orderId: string, customerId: string): Promise<boolean>;
  /** Rattache atomiquement toutes les sous-commandes d'un panier au même compte. */
  claimCheckout(orders: readonly OrderRecord[], customerId: string): Promise<boolean>;
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
  disputes: { orderBy: { createdAt: 'desc' }, take: 1 },
  shop: { select: { id: true, slug: true, name: true, city: true, district: true, phone: true } },
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
  shopId: row.shopId,
  shop: row.shop,
  checkoutNumber: row.checkoutNumber,
  fulfilledBy: row.fulfilledBy,
  collectionConfirmedAt: row.collectionConfirmedAt,
  collectionConfirmedBy: row.collectionConfirmedBy,
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

/** Un panier appartient déjà à un compte ou a été rattaché en parallèle. */
class StaleClaim extends Error {}

/** Levée dans la transaction pour l'annuler entièrement quand un article manque. */
class OutOfStock extends Error {
  constructor(readonly shortages: Array<{ variantId: string; available: number }>) {
    super('Stock insuffisant');
  }
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export const ordersRepository: OrdersRepository = {
  async create(order) {
    const result = await ordersRepository.createCheckout([order]);
    return result.outcome === 'created' ? { outcome: 'created', order: result.orders[0]! } : result;
  },

  /**
   * Réservation du stock et création des commandes d'un même panier dans une seule transaction : toutes ou
   * aucune. Les variantes sont verrouillées (FOR UPDATE) une fois, dans un ordre fixe : deux paniers simultanés
   * sur le même article passent l'un après l'autre, sans survente ni interblocage.
   */
  async createCheckout(newOrders) {
    const quantities = new Map<string, number>();
    for (const item of newOrders.flatMap((o) => o.items))
      quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
    const variantIds = [...quantities.keys()].sort();
    try {
      const created = await prisma.$transaction(async (tx) => {
        for (const order of newOrders) {
          if (order.promoCodeId) await usePromoCode(tx, order.promoCodeId);
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

        const rows = [];
        for (const order of newOrders) {
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
          rows.push(row);
        }
        return rows;
      });
      return { outcome: 'created', orders: created.map(toRecord) };
    } catch (error) {
      if (error instanceof OutOfStock) return { outcome: 'out_of_stock', shortages: error.shortages };
      if (error instanceof PromoUnavailable) return { outcome: 'promo_unavailable' };
      if (isUniqueViolation(error)) {
        // Deux contraintes uniques possibles : la clé d'idempotence (requête rejouée) ou le numéro tiré au hasard
        const replay = await prisma.order.findFirst({
          where: { idempotencyKey: { in: newOrders.map((o) => o.idempotencyKey) } },
          select: { id: true },
        });
        return { outcome: replay ? 'duplicate_request' : 'number_taken' };
      }
      throw error;
    }
  },

  async findByCheckout(checkoutNumber) {
    const rows = await prisma.order.findMany({
      where: { checkoutNumber },
      include,
      orderBy: [{ createdAt: 'asc' }, { idempotencyKey: 'asc' }],
    });
    return rows.map(toRecord);
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

  async listForStaff({ status, review, paymentMethod, paymentStatus, search, shopId, sort, page, limit }) {
    const where: Prisma.OrderWhereInput = {
      ...(status ? { status } : {}),
      ...(shopId ? { shopId: shopId === 'okoza' ? null : shopId } : {}),
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

  async applyCentralRouteTransition(order, change, actor) {
    try {
      const rows = await prisma.$transaction(async (tx) => {
        const where = order.checkoutNumber
          ? { checkoutNumber: order.checkoutNumber, fulfilledBy: 'okoza' as const, status: { not: 'cancelled' as const } }
          : { id: order.id, fulfilledBy: 'okoza' as const, status: { not: 'cancelled' as const } };
        const route = (await tx.order.findMany({ where, include, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map(
          toRecord,
        );
        if (!route.length || route.some((stop) => stop.status !== change.from)) throw new StaleOrder();
        if (change.to === 'courier_assigned' && route.some((stop) => stop.collectionConfirmedAt)) throw new StaleOrder();
        if (change.to === 'shipping' && route.some((stop) => !stop.collectionConfirmedAt)) throw new StaleOrder();
        if (change.to === 'delivered' && route.some((stop) => stop.status !== 'shipping')) throw new StaleOrder();

        for (const [index, stop] of route.entries()) {
          const courier =
            change.to === 'courier_assigned' && change.courier
              ? { ...change.courier, deliveryCost: index === 0 ? change.courier.deliveryCost : 0 }
              : change.courier;
          await applyInTransaction(tx, stop, { ...change, courier }, actor);
        }
        return tx.order.findMany({ where: { id: { in: route.map((stop) => stop.id) } }, include });
      });
      return { outcome: 'applied', orders: rows.map(toRecord) };
    } catch (error) {
      if (error instanceof StaleOrder) return { outcome: 'stale' };
      throw error;
    }
  },

  async confirmCentralCollection(order, by, actor, at) {
    try {
      const rows = await prisma.$transaction(async (tx) => {
        const where = order.checkoutNumber
          ? { checkoutNumber: order.checkoutNumber, fulfilledBy: 'okoza' as const, status: { not: 'cancelled' as const } }
          : { id: order.id, fulfilledBy: 'okoza' as const, status: { not: 'cancelled' as const } };
        const route = (await tx.order.findMany({ where, include, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map(
          toRecord,
        );
        if (!route.length || route.some((stop) => stop.status !== 'courier_assigned')) throw new StaleOrder();
        const moved = await tx.order.updateMany({
          where: { id: order.id, status: 'courier_assigned', collectionConfirmedAt: null },
          data: { collectionConfirmedAt: at, collectionConfirmedBy: by },
        });
        if (moved.count !== 1) throw new StaleOrder();
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            status: 'courier_assigned',
            fromStatus: 'courier_assigned',
            note: `Collecte confirmée par ${by}`,
            actor: actor.type,
            staffId: actor.type === 'staff' ? actor.staffId : null,
            createdAt: at,
          },
          select: { id: true },
        });

        const updated = (await tx.order.findMany({ where, include, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map(
          toRecord,
        );
        if (updated.every((stop) => stop.collectionConfirmedAt)) {
          for (const stop of updated)
            await applyInTransaction(
              tx,
              stop,
              { from: 'courier_assigned', to: 'shipping', note: 'Toutes les collectes sont terminées', stock: null },
              { type: 'system' },
            );
        }
        const ids = updated.map((stop) => stop.id);
        return tx.order.findMany({ where: { id: { in: ids } }, include });
      });
      return { outcome: 'applied', orders: rows.map(toRecord) };
    } catch (error) {
      if (error instanceof StaleOrder) return { outcome: 'stale' };
      throw error;
    }
  },

  async setDeliveryCost(orderId, cost) {
    const updated = await prisma.order.updateMany({ where: { id: orderId }, data: { deliveryCost: cost } });
    return updated.count === 1 ? ordersRepository.findById(orderId) : null;
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

  async claimCheckout(routeOrders, customerId) {
    if (!routeOrders.length) return false;
    try {
      await prisma.$transaction(async (tx) => {
        const ids = routeOrders.map((order) => order.id);
        const unclaimed = await tx.order.count({ where: { id: { in: ids }, customerId: null } });
        if (unclaimed !== ids.length) throw new StaleClaim();
        const updated = await tx.order.updateMany({ where: { id: { in: ids }, customerId: null }, data: { customerId } });
        if (updated.count !== ids.length) throw new StaleClaim();
      });
      return true;
    } catch (error) {
      if (error instanceof StaleClaim) return false;
      throw error;
    }
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
      ...(change.to === 'courier_assigned' || (change.to === 'ready' && order.fulfilledBy === 'okoza')
        ? { collectionConfirmedAt: null, collectionConfirmedBy: null }
        : {}),
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
async function usePromoCode(tx: Tx, promoCodeId: string) {
  const [promo] = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE promo_codes SET uses = uses + 1
    WHERE id = ${promoCodeId}::uuid AND active AND (max_uses IS NULL OR uses < max_uses)
    RETURNING id`;
  if (!promo) throw new PromoUnavailable();
}

/**
 * Annulation : le code redevient disponible. Les index partiels empêchent tout doublon.
 */
async function undoOrderAdvantages(tx: Tx, order: OrderRecord) {
  if (order.promoCodeId)
    await tx.$executeRaw`UPDATE promo_codes SET uses = GREATEST(uses - 1, 0) WHERE id = ${order.promoCodeId}::uuid`;
}
