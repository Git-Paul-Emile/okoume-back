import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { can, isOwner, type Grantee } from '../../core/security/permissions.js';
import { fcfa } from '../../core/text/fcfa.js';
import type { OrderRecord, OrdersRepository } from '../orders/orders.repository.js';
import type { PaymentRecord, PaymentResult, PaymentsRepository } from '../payments/payments.repository.js';
import {
  expectedPayment,
  PAYMENT_LABEL,
  paidAmount,
  refundedAmount,
  withinRefundLimit,
} from '../payments/payments.rules.js';
import type { LoyaltyRepository } from '../loyalty/loyalty.repository.js';
import { EARN_PER } from '../orders/orders.pricing.js';
import type { ReturnsRepository } from '../returns/returns.repository.js';
import { toStaffOrderDto } from '../staff-orders/staff-orders.dto.js';
import type { RecordPaymentInput, RefundInput } from './staff-payments.schemas.js';

export type PaymentActor = Grantee & { id: string; refundLimit: number | null };

/** Tolérance d'horloge pour une date de réception saisie « maintenant ». */
const CLOCK_SKEW_MS = 60_000;
const STALE = 'Le paiement de cette commande a changé entre-temps : rechargez-la.';

const toPaymentDto = (p: PaymentRecord) => ({
  ...p,
  occurredAt: p.occurredAt.toISOString(),
  createdAt: p.createdAt.toISOString(),
});

export const createStaffPaymentsService = (
  orders: OrdersRepository,
  payments: PaymentsRepository,
  returns: ReturnsRepository,
  loyalty: LoyaltyRepository,
  now: () => Date,
) => {
  async function load(id: string) {
    const order = await orders.findById(id);
    if (!order) throw new NotFoundError('Commande introuvable.');
    return order;
  }

  function assertDate(at: Date, order: OrderRecord) {
    if (at.getTime() > now().getTime() + CLOCK_SKEW_MS)
      throw new UnprocessableError('La date ne peut pas être dans le futur.');
    if (at < order.createdAt) throw new UnprocessableError('La date précède la commande.');
  }

  /**
   * Points gagnés sur les articles retournés (12.3) : au prorata de leur prix dans la commande, sans dépasser
   * ce que la commande porte encore. Le solde du client peut devenir négatif.
   */
  async function pointsOnReturnedItems(
    order: OrderRecord,
    items: ReadonlyArray<{ variantId: string; quantity: number }>,
  ) {
    const remaining = await loyalty.earnedFor(order.id);
    if (!remaining || order.totals.subtotal <= 0) return 0;
    const t = order.totals;
    const gross = Math.floor(Math.max(0, t.subtotal - t.codeDiscount - t.pointsDiscount) / EARN_PER);
    const returned = items.reduce(
      (sum, r) => sum + (order.items.find((i) => i.variantId === r.variantId)?.unitPrice ?? 0) * r.quantity,
      0,
    );
    return Math.min(remaining, Math.round((gross * returned) / t.subtotal));
  }

  async function summary(order: OrderRecord) {
    const list = await payments.listForOrder(order.id);
    const paid = paidAmount(list);
    const refunded = refundedAmount(list);
    return {
      order: toStaffOrderDto(order),
      payments: list.map(toPaymentDto),
      paid,
      refunded,
      due: Math.max(0, expectedPayment(order) - paid),
      refundable: Math.max(0, paid - refunded),
    };
  }

  async function applied(result: PaymentResult, orderId: string) {
    if (result.outcome === 'stale') throw new ConflictError(STALE);
    if (result.outcome === 'reference_taken')
      throw new ConflictError(
        `Référence déjà enregistrée${result.orderNumber ? ` sur ${result.orderNumber}` : ''} : double paiement ou erreur, à vérifier avant tout enregistrement.`,
      );
    return summary(await load(orderId));
  }

  return {
    async get(orderId: string, actor: Grantee) {
      if (!can(actor, 'paiements:consulter')) throw new ForbiddenError();
      return summary(await load(orderId));
    },

    /**
     * Encaissement vérifié (8.4, 8.5) : le total exact, jamais un montant partiel. Mobile Money : référence
     * de la transaction obligatoire. Un paiement arrivé après annulation laisse la commande annulée et
     * devient un remboursement à organiser.
     */
    async record(orderId: string, input: RecordPaymentInput, actor: PaymentActor) {
      if (!can(actor, 'paiements:valider')) throw new ForbiddenError();
      const order = await load(orderId);
      if (order.paymentStatus !== 'awaiting_payment' && order.paymentStatus !== 'awaiting_verification')
        throw new ConflictError('Le paiement de cette commande est déjà enregistré.');
      const expected = expectedPayment(order);
      if (input.amount !== expected)
        throw new UnprocessableError(
          `Montant attendu : ${fcfa(expected)}, le total exact de la commande (aucun paiement partiel).`,
        );
      if (order.paymentMethod !== 'cash' && !input.reference)
        throw new UnprocessableError('Indiquez la référence de la transaction Mobile Money.');
      assertDate(input.receivedAt, order);

      const next = order.status === 'cancelled' ? 'refund_due' : 'paid';
      const note =
        next === 'paid'
          ? `Paiement reçu : ${fcfa(input.amount)} (${PAYMENT_LABEL[order.paymentMethod]})`
          : `Paiement reçu après annulation : ${fcfa(input.amount)}, remboursement à organiser`;
      const result = await payments.record(
        order,
        {
          kind: 'payment',
          amount: input.amount,
          method: order.paymentMethod,
          occurredAt: input.receivedAt,
          reference: input.reference,
          noReferenceReason: null,
          clientAgreed: false,
          staffId: actor.id,
        },
        next,
        note,
        { issuedAt: now() },
      );
      return applied(result, orderId);
    },

    /**
     * Remboursement effectué (14.4, 14.5) : seulement sur une commande « remboursement à effectuer », dans la
     * limite de ce qui a été encaissé et du plafond de la personne. Pour un retour, dans la limite du montant
     * fixé à l'inspection. « Remboursé » quand tout l'encaissé est rendu.
     */
    async refund(orderId: string, input: RefundInput, actor: PaymentActor) {
      if (!can(actor, 'paiements:valider')) throw new ForbiddenError();
      if (!withinRefundLimit(isOwner(actor), actor.refundLimit, input.amount))
        throw new ForbiddenError('Ce montant dépasse votre plafond de remboursement.');
      const order = await load(orderId);
      if (order.paymentStatus !== 'refund_due')
        throw new ConflictError('Aucun remboursement à effectuer sur cette commande.');
      const list = await payments.listForOrder(order.id);
      const paid = paidAmount(list);
      const refundedBefore = refundedAmount(list);
      // Commande non annulée en « Remboursement à effectuer » : c'est un retour inspecté (14.4)
      const ret = order.status === 'cancelled' ? null : await returns.findByOrder(order.id);
      if (order.status !== 'cancelled' && ret?.status !== 'refund_due')
        throw new ConflictError('Aucun retour inspecté à rembourser sur cette commande.');
      const refundable = ret
        ? Math.min((ret.refundAmount ?? 0) - ret.refundedAmount, paid - refundedBefore)
        : paid - refundedBefore;
      if (input.amount > refundable)
        throw new UnprocessableError(`Le remboursement dépasse le montant restant à rembourser (${fcfa(refundable)}).`);
      if (input.method !== order.paymentMethod && !input.clientAgreed)
        throw new UnprocessableError('Un autre moyen que le paiement initial exige l’accord du client.');
      assertDate(input.refundedAt, order);

      const completes = input.amount === refundable;
      const pointsToReverse = ret && completes ? await pointsOnReturnedItems(order, ret.items) : 0;
      // Retour partiel remboursé : le reste de la commande demeure payé
      const next = !completes ? 'refund_due' : refundedBefore + input.amount >= paid ? 'refunded' : 'paid';
      const result = await payments.record(
        order,
        {
          kind: 'refund',
          amount: input.amount,
          method: input.method,
          occurredAt: input.refundedAt,
          reference: input.reference,
          noReferenceReason: input.reference ? null : input.noReferenceReason,
          clientAgreed: input.clientAgreed,
          staffId: actor.id,
        },
        next,
        `Remboursement effectué : ${fcfa(input.amount)} (${PAYMENT_LABEL[input.method]})`,
        { issuedAt: now(), returnRefund: ret ? { returnId: ret.id, completes, pointsToReverse } : undefined },
      );
      return applied(result, orderId);
    },
  };
};

export type StaffPaymentsService = ReturnType<typeof createStaffPaymentsService>;
