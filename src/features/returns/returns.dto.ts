import type { ReturnRecord } from './returns.repository.js';

/** Vue du client : étapes, décision et montant, sans le nom des membres de l'équipe. */
export const toReturnDto = (r: ReturnRecord) => ({
  id: r.id,
  orderId: r.orderId,
  orderNumber: r.orderNumber,
  status: r.status,
  reason: r.reason,
  comment: r.comment,
  items: r.items.map(({ variantId, quantity }) => ({ variantId, quantity })),
  decisionReason: r.decisionReason,
  shippingPaidBy: r.shippingPaidBy,
  refundAmount: r.refundAmount,
  refundedAmount: r.refundedAmount,
  history: r.events.map((e) => ({ status: e.status, note: e.note, at: e.createdAt.toISOString() })),
  createdAt: r.createdAt.toISOString(),
});

/** Vue de l'équipe : dossier et justificatifs, sans les champs historiques d'inspection du MVP précédent. */
export const toStaffReturnDto = (r: ReturnRecord) => ({
  ...toReturnDto(r),
  customerId: r.customerId,
  evidenceUrls: r.evidenceUrls,
  shippingReason: r.shippingReason,
  reopenRequestedAt: r.reopenRequestedAt?.toISOString() ?? null,
  items: r.items.map(({ variantId, quantity }) => ({ variantId, quantity })),
  history: r.events.map((e) => ({
    status: e.status,
    note: e.note,
    actor: e.actor,
    ...(e.by ? { by: e.by } : {}),
    at: e.createdAt.toISOString(),
  })),
});
