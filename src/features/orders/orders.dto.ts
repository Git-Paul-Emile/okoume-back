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
  pointsUsed: number;
  paymentMethod: OrderRecord['paymentMethod'];
  paymentStatus: OrderRecord['paymentStatus'];
  /** Paiement Mobile Money déclaré par le client, en attente de vérification par l'équipe */
  paymentDeclaration: { reference: string; at: string } | null;
  status: OrderRecord['status'];
  history: Array<{ status: OrderRecord['status']; at: string; from?: OrderRecord['status']; note?: string }>;
  cancellationRequest: {
    reason: string;
    comment: string;
    status: 'pending' | 'accepted' | 'refused';
    createdAt: string;
    decisionReason?: string;
  } | null;
  deliveryFeeChange: { fromFee: number; toFee: number; reason: string; status: string; createdAt: string } | null;
  deliveryDispute: { reason: string; status: string; resolution: string | null; createdAt: string } | null;
  createdAt: string;
}

export const toOrderDto = (o: OrderRecord): OrderDto => ({
  id: o.id,
  number: o.number,
  trackingCode: o.trackingCode,
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
  pointsUsed: o.pointsUsed,
  paymentMethod: o.paymentMethod,
  paymentStatus: o.paymentStatus,
  paymentDeclaration: o.paymentDeclaration
    ? { reference: o.paymentDeclaration.reference, at: o.paymentDeclaration.at.toISOString() }
    : null,
  status: o.status,
  history: o.events.map((e) => ({
    status: e.status,
    at: e.createdAt.toISOString(),
    ...(e.fromStatus ? { from: e.fromStatus } : {}),
    ...(e.note ? { note: e.note } : {}),
  })),
  cancellationRequest: o.cancellation && {
    reason: o.cancellation.reason,
    comment: o.cancellation.comment,
    status: o.cancellation.status,
    createdAt: o.cancellation.createdAt.toISOString(),
    ...(o.cancellation.decisionReason ? { decisionReason: o.cancellation.decisionReason } : {}),
  },
  deliveryFeeChange: o.feeChange && {
    fromFee: o.feeChange.fromFee,
    toFee: o.feeChange.toFee,
    reason: o.feeChange.reason,
    status: o.feeChange.status,
    createdAt: o.feeChange.createdAt.toISOString(),
  },
  deliveryDispute: o.dispute && {
    reason: o.dispute.reason,
    status: o.dispute.status,
    resolution: o.dispute.resolution,
    createdAt: o.dispute.createdAt.toISOString(),
  },
  createdAt: o.createdAt.toISOString(),
});

/** Suivi public par numéro et code : l'avancement et le contenu, jamais les coordonnées du client. */
export type TrackingDto = Pick<
  OrderDto,
  | 'number'
  | 'status'
  | 'history'
  | 'items'
  | 'totals'
  | 'paymentMethod'
  | 'paymentStatus'
  | 'paymentDeclaration'
  | 'createdAt'
> & {
  zoneName: string;
};

export const toTrackingDto = (o: OrderRecord): TrackingDto => {
  const { number, status, history, items, totals, paymentMethod, paymentStatus, paymentDeclaration, createdAt } =
    toOrderDto(o);
  return {
    number,
    status,
    history,
    items,
    totals,
    paymentMethod,
    paymentStatus,
    // Saisie du client lui-même, lisible seulement avec le code de suivi
    paymentDeclaration,
    createdAt,
    zoneName: o.zoneName,
  };
};
