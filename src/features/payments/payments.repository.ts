import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { issueCreditNote, issueInvoice } from '../invoices/invoices.repository.js';
import { creditEarnedPoints, reversePoints } from '../loyalty/loyalty.repository.js';
import { rewardFirstOrder } from '../loyalty-rewards/loyalty-rewards.repository.js';
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
  /** Points gagnés sur les articles remboursés, retirés au même moment (12.3) */
  pointsToReverse: number;
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
  /** Changement de moyen de paiement par le client, tant que rien n'est encaissé (8.6). */
  changeMethod(order: OrderRecord, to: PaymentMethod, note: string): Promise<boolean>;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

class StalePayment extends Error {}

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
      by: `${staff.firstName} ${staff.lastName}`,
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
          if (order.customerId)
            await reversePoints(tx, {
              customerId: order.customerId,
              orderId: order.id,
              points: returnRefund.pointsToReverse,
              label: `Points retirés : articles remboursés (${order.number})`,
            });
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
            actor: 'staff',
            staffId: payment.staffId,
          },
          select: { id: true },
        });
        // Paiement enregistré sur une commande déjà livrée : les points sont crédités
        await creditEarnedPoints(tx, order.id);
        await rewardFirstOrder(tx, order.id);
        // Facture après confirmation du paiement ; avoir pour tout remboursement d'une commande facturée (25.4)
        if (payment.kind === 'payment' && nextStatus === 'paid') await issueInvoice(tx, order, issuedAt);
        if (payment.kind === 'refund') await issueCreditNote(tx, order.id, payment.amount, note, issuedAt);
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

  async changeMethod(order, to, note) {
    return prisma.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({
        where: {
          id: order.id,
          paymentMethod: order.paymentMethod,
          paymentStatus: 'awaiting_payment',
          status: { notIn: ['delivered', 'cancelled'] },
        },
        data: { paymentMethod: to },
      });
      if (changed.count !== 1) return false;
      await tx.orderEvent.create({
        data: { orderId: order.id, status: order.status, fromStatus: order.status, note, actor: 'customer' },
        select: { id: true },
      });
      return true;
    });
  },
};
