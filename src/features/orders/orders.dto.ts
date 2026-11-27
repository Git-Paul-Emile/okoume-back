import type { OrderRecord } from './orders.repository.js';

/** Même forme que le type Order du front (front/src/features/orders/orders.types.ts), sans les données internes. */
export interface OrderDto {
  id: string;
  number: string;
  trackingCode: string;
  items: Array<{
    productId: string;
    variantId: string;
    name: string;
    variantLabel: string;
    image: string;
    unitPrice: number;
    originalPrice: number;
    vatRate: number;
    quantity: number;
  }>;
  customer: {
    recipient: string;
    phone: string;
    email: string;
    zoneId: string;
    zoneName: string;
    landmark: string;
    instructions: string;
  };
  totals: OrderRecord['totals'];
  promoCode: string | null;
  paymentMethod: OrderRecord['paymentMethod'];
  paymentStatus: OrderRecord['paymentStatus'];
  status: OrderRecord['status'];
  history: Array<{ status: OrderRecord['status']; at: string; from?: OrderRecord['status']; note?: string }>;
  /** Boutique qui vend (32.4) : null pour la boutique OKOZA */
  shop: { slug: string; name: string } | null;
  /** Passage en caisse commun aux commandes d'un même panier */
  checkoutNumber: string | null;
  /** Qui livre (32.5) */
  fulfilledBy: 'okoza' | 'seller';
  collectionConfirmedAt: string | null;
  collectionConfirmedBy: string | null;
  createdAt: string;
}

export const toOrderDto = (o: OrderRecord): OrderDto => ({
  id: o.id,
  number: o.number,
  trackingCode: o.trackingCode,
  shop: o.shop && { slug: o.shop.slug, name: o.shop.name },
  checkoutNumber: o.checkoutNumber,
  fulfilledBy: o.fulfilledBy,
  collectionConfirmedAt: o.collectionConfirmedAt?.toISOString() ?? null,
  collectionConfirmedBy: o.collectionConfirmedBy,
  items: o.items,
  customer: {
    recipient: o.recipient,
    phone: o.phone,
    email: o.email,
    zoneId: o.zoneId,
    zoneName: o.zoneName,
    landmark: o.landmark,
    instructions: o.instructions,
  },
  totals: o.totals,
  promoCode: o.promoCode,
  paymentMethod: o.paymentMethod,
  paymentStatus: o.paymentStatus,
  status: o.status,
  history: o.events.map((e) => ({
    status: e.status,
    at: e.createdAt.toISOString(),
    ...(e.fromStatus ? { from: e.fromStatus } : {}),
    ...(e.note ? { note: e.note } : {}),
  })),
  createdAt: o.createdAt.toISOString(),
});

/** Suivi public par numéro et code : l'avancement et le contenu, jamais les coordonnées du client. */
export interface TrackingDto {
  number: string;
  checkoutNumber: string | null;
  status: OrderRecord['status'];
  history: Array<{ status: OrderRecord['status']; at: string; from?: OrderRecord['status']; note?: string }>;
  items: OrderDto['items'];
  totals: OrderRecord['totals'];
  paymentMethod: OrderRecord['paymentMethod'];
  paymentStatus: OrderRecord['paymentStatus'];
  createdAt: string;
  zoneName: string;
  orders: Array<{
    number: string;
    shopName: string;
    status: OrderRecord['status'];
    paymentStatus: OrderRecord['paymentStatus'];
    fulfilledBy: OrderRecord['fulfilledBy'];
    total: number;
    collectionConfirmedAt: string | null;
  }>;
}

/** Suivi global sans coordonnées du client : les sous-commandes restent visibles par boutique. */
export const toTrackingDto = (route: readonly OrderRecord[]): TrackingDto => {
  const first = route[0];
  if (!first) throw new Error('Un suivi doit contenir au moins une commande.');
  const statusRank: Record<OrderRecord['status'], number> = {
    confirmed: 0,
    preparing: 1,
    ready: 2,
    courier_assigned: 3,
    shipping: 4,
    delivered: 5,
  };
  const status = route.reduce(
    (slowest, order) => (statusRank[order.status] < statusRank[slowest] ? order.status : slowest),
    first.status,
  );
  const paymentStatus = route.every((order) => order.paymentStatus === 'paid') ? 'paid' : 'awaiting_payment';
  const totals = route.reduce(
    (sum, order) => ({
      subtotal: sum.subtotal + order.totals.subtotal,
      productDiscount: sum.productDiscount + order.totals.productDiscount,
      codeDiscount: sum.codeDiscount + order.totals.codeDiscount,
      deliveryFee: sum.deliveryFee + order.totals.deliveryFee,
      deliveryDiscount: sum.deliveryDiscount + order.totals.deliveryDiscount,
      total: sum.total + order.totals.total,
    }),
    { subtotal: 0, productDiscount: 0, codeDiscount: 0, deliveryFee: 0, deliveryDiscount: 0, total: 0 },
  );
  const history = route
    .flatMap((order) =>
      order.events.map((event) => ({
        status: event.status,
        at: event.createdAt.toISOString(),
        ...(event.fromStatus ? { from: event.fromStatus } : {}),
        ...(event.note ? { note: event.note } : {}),
      })),
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  return {
    number: first.checkoutNumber ?? first.number,
    checkoutNumber: first.checkoutNumber,
    status,
    history,
    items: route.flatMap((order) => toOrderDto(order).items),
    totals,
    paymentMethod: first.paymentMethod,
    paymentStatus,
    createdAt: first.createdAt.toISOString(),
    zoneName: first.zoneName,
    orders: route.map((order) => ({
      number: order.number,
      shopName: order.shop?.name ?? 'OKOZA',
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfilledBy: order.fulfilledBy,
      total: order.totals.total,
      collectionConfirmedAt: order.collectionConfirmedAt?.toISOString() ?? null,
    })),
  };
};
