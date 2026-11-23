import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { issueCreditNote, issueInvoice } from '../invoices/invoices.repository.js';
import type { OrderRecord, PaymentMethod, PaymentStatus } from '../orders/orders.repository.js';

export interface PaymentRecord {
  id: string;
  kind: 'payment' | 'refund';
  amount: number;
  method: PaymentMethod;
  occurredAt: Date;
  reference: string | null;
  noReferenceReason: string | null;
  clientAgreed: boolean;
  /** Prénom et nom de la personne qui a enregistré l'opération */
  by: string;
  createdAt: Date;
}

export interface PaymentWrite {
  kind: 'payment' | 'refund';
  amount: number;
  method: PaymentMethod;
  occurredAt: Date;
  reference: string | null;
  noReferenceReason: string | null;
  clientAgreed: boolean;
  /** null : encaissement déclaré par le vendeur qui a livré lui-même (32.6) */
  staffId: string | null;
}

/** Un seul encaissement physique, réparti en écritures par boutique. */
export interface CheckoutPaymentWrite {
  method: PaymentMethod;
  occurredAt: Date;
  reference: string | null;
  staffId: string;
}

/**
 * « stale » : le statut de paiement a changé depuis la lecture, rien n'est écrit.
 * « reference_taken » : la référence sert déjà à un autre encaissement (double paiement possible).
 */
export type PaymentResult =
  { outcome: 'applied' } | { outcome: 'stale' } | { outcome: 'reference_taken'; orderNumber: string | null };

/** Remboursement d'articles retournés : le dossier suit dans la même transaction. */
export interface ReturnRefund {
  returnId: string;
  /** Le dossier passe « Remboursé » quand tout son montant est rendu */
  completes: boolean;
}

export interface RecordOptions {
  /** Date d'émission de la facture ou de l'avoir */
  issuedAt: Date;
  returnRefund?: ReturnRefund | undefined;
}

/** Contrat de stockage des paiements. */
export interface PaymentsRepository {
  listForOrder(orderId: string): Promise<PaymentRecord[]>;
  /** Opération, nouveau statut de paiement et étape d'historique, ensemble ou pas du tout. */
  /**
   * Opération, nouveau statut, étape d'historique et document comptable (facture quand la commande devient
   * payée, avoir pour un remboursement), ensemble ou pas du tout.
   */
  record(
    order: OrderRecord,
    payment: PaymentWrite,
    nextStatus: PaymentStatus,
    note: string,
    options: RecordOptions,
  ): Promise<PaymentResult>;
  /** Confirme l'encaissement unique d'une tournée et répartit le montant entre ses sous-commandes. */
  recordCheckout(
    orders: readonly OrderRecord[],
    payment: CheckoutPaymentWrite,
    options: RecordOptions,
  ): Promise<PaymentResult>;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

class StalePayment extends Error {}

/**
 * Reversement dû au vendeur (32.6) : encaissé moins la livraison (gardée par OKOZA, qui a livré) et la commission
 * en vigueur, arrondie au franc inférieur en faveur du vendeur. Un seul par commande (contrainte unique).
 */
async function createPayout(tx: Prisma.TransactionClient, order: OrderRecord, collected: number) {
  const settings = await tx.marketplaceSettings.findUnique({ where: { id: 1 }, select: { commissionRate: true } });
  const rate = settings?.commissionRate.toNumber() ?? 0;
  const deliveryFee = Math.min(collected, Math.max(0, order.totals.deliveryFee - order.totals.deliveryDiscount));
  const commission = Math.floor(((collected - deliveryFee) * rate) / 100);
  await tx.sellerPayout.create({
    data: {
      shopId: order.shopId!,
      orderId: order.id,
      collected,
      deliveryFee,
      commissionRate: rate,
      commission,
      amount: collected - deliveryFee - commission,
    },
    select: { id: true },
  });
}

async function recordInTransaction(
  tx: Prisma.TransactionClient,
  order: OrderRecord,
  payment: PaymentWrite & { kind: 'payment' },
  note: string,
  issuedAt: Date,
) {
  await tx.payment.create({ data: { ...payment, orderId: order.id }, select: { id: true } });
  await tx.orderEvent.create({
    data: {
      orderId: order.id,
      status: order.status,
      fromStatus: order.status,
      note,
      actor: payment.staffId ? 'staff' : 'seller',
      staffId: payment.staffId,
    },
    select: { id: true },
  });
  if (order.shopId === null) await issueInvoice(tx, order, issuedAt);
  if (order.shopId && order.fulfilledBy === 'okoza') await createPayout(tx, order, payment.amount);
}

export const paymentsRepository: PaymentsRepository = {
  async listForOrder(orderId) {
    const rows = await prisma.payment.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { staff: { select: { firstName: true, lastName: true } } },
    });
    return rows.map(({ staff, amount, orderId: _o, staffId: _s, ...p }) => ({
      ...p,
      amount: amount.toNumber(),
      by: staff ? `${staff.firstName} ${staff.lastName}` : 'Le vendeur',
    }));
  },

  async record(order, payment, nextStatus, note, { issuedAt, returnRefund }) {
    try {
      await prisma.$transaction(async (tx) => {
        const moved = await tx.order.updateMany({
          where: { id: order.id, paymentStatus: order.paymentStatus },
          data: { paymentStatus: nextStatus },
        });
        if (moved.count !== 1) throw new StalePayment();
        await tx.payment.create({ data: { ...payment, orderId: order.id }, select: { id: true } });
        if (returnRefund) {
          const updated = await tx.returnRequest.updateMany({
            where: { id: returnRefund.returnId, status: 'refund_due' },
            data: {
              refundedAmount: { increment: payment.amount },
              ...(returnRefund.completes ? { status: 'refunded' } : {}),
            },
          });
          if (updated.count !== 1) throw new StalePayment();
          if (returnRefund.completes)
            await tx.returnEvent.create({
              data: {
                returnId: returnRefund.returnId,
                status: 'refunded',
                note,
                actor: 'staff',
                staffId: payment.staffId,
              },
              select: { id: true },
            });
        }
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            status: order.status,
            fromStatus: order.status,
            note,
            actor: payment.staffId ? 'staff' : 'seller',
            staffId: payment.staffId,
          },
          select: { id: true },
        });
        // Facture après confirmation du paiement ; avoir pour tout remboursement d'une commande facturée (25.4).
        // Les ventes des vendeurs ne sont pas facturées par OKOZA tant que leur facturation n'est pas validée (32.7)
        if (payment.kind === 'payment' && nextStatus === 'paid' && !order.shopId)
          await issueInvoice(tx, order, issuedAt);
        // Encaissé par un livreur OKOZA pour un vendeur : le reversement à lui faire est créé avec le paiement (32.6)
        if (payment.kind === 'payment' && nextStatus === 'paid' && order.shopId && order.fulfilledBy === 'okoza')
          await createPayout(tx, order, payment.amount);
        if (payment.kind === 'refund' && !order.shopId)
          await issueCreditNote(tx, order.id, payment.amount, note, issuedAt);
        // Remboursement d'une vente de vendeur avant son reversement : rien n'est plus dû au vendeur pour elle (32.7).
        // Déjà reversé, la somme est à récupérer auprès du vendeur : l'équipe le voit sur la commande.
        if (payment.kind === 'refund' && order.shopId)
          await tx.sellerPayout.updateMany({
            where: { orderId: order.id, status: 'pending' },
            data: { status: 'cancelled' },
          });
      });
      return { outcome: 'applied' };
    } catch (error) {
      if (error instanceof StalePayment) return { outcome: 'stale' };
      if (isUniqueViolation(error) && payment.reference) {
        const clash = await prisma.payment.findFirst({
          where: { kind: 'payment', reference: { equals: payment.reference, mode: 'insensitive' } },
          select: { order: { select: { number: true } } },
        });
        return { outcome: 'reference_taken', orderNumber: clash?.order.number ?? null };
      }
      throw error;
    }
  },

  async recordCheckout(orders, payment, { issuedAt }) {
    if (!orders.length) return { outcome: 'stale' };
    try {
      await prisma.$transaction(async (tx) => {
        const ids = orders.map((order) => order.id);
        if (orders.some((order) => order.paymentMethod !== payment.method || order.status !== 'delivered'))
          throw new StalePayment();
        const moved = await tx.order.updateMany({
          where: { id: { in: ids }, status: 'delivered', paymentStatus: { in: ['awaiting_payment', 'awaiting_verification'] } },
          data: { paymentStatus: 'paid' },
        });
        if (moved.count !== orders.length) throw new StalePayment();

        for (const [index, order] of orders.entries()) {
          const amount = order.totals.total;
          const paymentWrite: PaymentWrite & { kind: 'payment' } = {
            kind: 'payment',
            amount,
            method: payment.method,
            occurredAt: payment.occurredAt,
            reference: index === 0 ? payment.reference : null,
            noReferenceReason:
              index === 0 || payment.method === 'cash'
                ? null
                : `Part du paiement global du panier ${order.checkoutNumber ?? order.number}`,
            clientAgreed: false,
            staffId: payment.staffId,
          };
          await recordInTransaction(
            tx,
            order,
            paymentWrite,
            `Part du paiement global du panier ${order.checkoutNumber ?? order.number} : ${amount} FCFA`,
            issuedAt,
          );
        }
      });
      return { outcome: 'applied' };
    } catch (error) {
      if (error instanceof StalePayment) return { outcome: 'stale' };
      if (isUniqueViolation(error) && payment.reference) {
        const clash = await prisma.payment.findFirst({
          where: { kind: 'payment', reference: { equals: payment.reference, mode: 'insensitive' } },
          select: { order: { select: { number: true } } },
        });
        return { outcome: 'reference_taken', orderNumber: clash?.order.number ?? null };
      }
      throw error;
    }
  },

};
