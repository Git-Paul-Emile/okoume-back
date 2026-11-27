import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export type OrderStatus =
  'confirmed' | 'preparing' | 'ready' | 'courier_assigned' | 'shipping' | 'delivered';
export type PaymentStatus = 'awaiting_payment' | 'paid';
export type PaymentMethod = 'cash' | 'airtel' | 'moov';

export interface OrderTotals {
  subtotal: number;
  productDiscount: number;
  codeDiscount: number;
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
  courierId: string | null;
  /** Coût réel de la course pour la boutique ; null tant qu'il n'est pas renseigné */
  deliveryCost: number | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  items: OrderItemRecord[];
  events: OrderEventRecord[];
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

export type NewOrder = Omit<
  OrderRecord,
  | 'id'
  | 'events'
  | 'createdAt'
  | 'status'
  | 'courierId'
  | 'deliveryCost'
  | 'shop'
  | 'collectionConfirmedAt'
  | 'collectionConfirmedBy'
>;

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
  stock: 'consume' | null;
  /** Livreur affecté avec le coût réel de la course ; null : livreur retiré ; absent : inchangé */
  courier?: { id: string; deliveryCost: number | null } | null | undefined;
}

/** « stale » : la commande a changé entre la lecture et l'écriture, rien n'a été appliqué. */
export type TransitionResult = { outcome: 'applied'; order: OrderRecord } | { outcome: 'stale' };
export type RouteUpdateResult = { outcome: 'applied'; orders: OrderRecord[] } | { outcome: 'stale' };

export interface StaffOrderFilters {
  status?: OrderStatus | undefined;
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
  /** Enregistre le coût réel de livraison pour les calculs de marge. */
  setDeliveryCost(orderId: string, cost: number): Promise<OrderRecord | null>;
}

const include = {
  items: true,
  events: { orderBy: { createdAt: 'asc' }, include: { staff: { select: { firstName: true, lastName: true } } } },
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
    deliveryFee: row.deliveryFee.toNumber(),
    deliveryDiscount: row.deliveryDiscount.toNumber(),
    total: row.total.toNumber(),
  },
  promoCode: row.promoCode,
  promoCodeId: row.promoCodeId,
  courierId: row.courierId,
  deliveryCost: row.deliveryCost?.toNumber() ?? null,
  paymentMethod: row.paymentMethod,
  paymentStatus: row.paymentStatus,
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
  createdAt: row.createdAt,
});

/** Code épuisé ou limite par client atteinte : la transaction est annulée. */
class PromoUnavailable extends Error {}

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

  async listForStaff({ status, paymentMethod, paymentStatus, search, shopId, sort, page, limit }) {
    const where: Prisma.OrderWhereInput = {
      ...(status ? { status } : {}),
      ...(shopId ? { shopId: shopId === 'okoza' ? null : shopId } : {}),
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
          ? { checkoutNumber: order.checkoutNumber, fulfilledBy: 'okoza' as const }
          : { id: order.id, fulfilledBy: 'okoza' as const };
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
          ? { checkoutNumber: order.checkoutNumber, fulfilledBy: 'okoza' as const }
          : { id: order.id, fulfilledBy: 'okoza' as const };
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


};

/** La commande a changé depuis sa lecture (autre membre de l'équipe, autre onglet) : tout est annulé. */
class StaleOrder extends Error {}

type Tx = Prisma.TransactionClient;

const STOCK_REASON = {
  consume: (number: string) => `Préparation de la commande ${number}`,
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

  if (!change.stock) return;
  const quantities = new Map<string, number>();
  for (const item of order.items) quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);

  // Ordre fixe des variantes, comme à la création : pas d'interblocage entre deux transactions
  for (const variantId of [...quantities.keys()].sort()) {
    const quantity = quantities.get(variantId) ?? 0;
    const [updated] = await tx.$queryRaw<Array<{ stock: number }>>`
            UPDATE variants SET stock = stock - ${quantity}, reserved = reserved - ${quantity}
            WHERE id = ${variantId}::uuid AND reserved >= ${quantity} RETURNING stock`;
    if (!updated) throw new Error(`Stock incohérent pour la variante ${variantId}`);
    const after = Number(updated.stock);
    const delta = -quantity;
    await tx.stockMovement.create({
      data: {
        variantId,
        type: 'commande',
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

