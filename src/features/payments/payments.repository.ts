import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import type { OrderRecord, PaymentMethod } from '../orders/orders.repository.js';

export interface PaymentRecord {
  id: string;
  kind: 'payment';
  amount: number;
  method: PaymentMethod;
  occurredAt: Date;
  reference: string | null;
  by: string;
  createdAt: Date;
}

export interface PaymentWrite {
  amount: number;
  method: PaymentMethod;
  occurredAt: Date;
  reference: string | null;
  staffId: string | null;
}

export interface CheckoutPaymentWrite {
  method: PaymentMethod;
  occurredAt: Date;
  reference: string | null;
  staffId: string;
}

export type PaymentResult =
  | { outcome: 'applied' }
  | { outcome: 'stale' }
  | { outcome: 'reference_taken'; orderNumber: string | null };

export interface PaymentsRepository {
  listForOrder(orderId: string): Promise<PaymentRecord[]>;
  record(order: OrderRecord, payment: PaymentWrite, note: string): Promise<PaymentResult>;
  recordCheckout(orders: readonly OrderRecord[], payment: CheckoutPaymentWrite): Promise<PaymentResult>;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

class StalePayment extends Error {}

async function createPayout(tx: Prisma.TransactionClient, order: OrderRecord, collected: number) {
  const rate = 0;
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

async function recordInTransaction(tx: Prisma.TransactionClient, order: OrderRecord, payment: PaymentWrite, note: string) {
  await tx.payment.create({
    data: { ...payment, orderId: order.id, kind: 'payment' },
    select: { id: true },
  });
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
  if (order.shopId && order.fulfilledBy === 'okoza') await createPayout(tx, order, payment.amount);
}

async function referenceTaken(error: unknown, reference: string | null): Promise<PaymentResult | null> {
  if (!isUniqueViolation(error) || !reference) return null;
  const clash = await prisma.payment.findFirst({
    where: { kind: 'payment', reference: { equals: reference, mode: 'insensitive' } },
    select: { order: { select: { number: true } } },
  });
  return { outcome: 'reference_taken', orderNumber: clash?.order.number ?? null };
}

export const paymentsRepository: PaymentsRepository = {
  async listForOrder(orderId) {
    const rows = await prisma.payment.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { staff: { select: { firstName: true, lastName: true } } },
    });
    return rows.map(({ staff, amount, orderId: _o, staffId: _s, ...payment }) => ({
      ...payment,
      kind: 'payment' as const,
      amount: amount.toNumber(),
      by: staff ? `${staff.firstName} ${staff.lastName}` : 'Le vendeur',
    }));
  },

  async record(order, payment, note) {
    try {
      await prisma.$transaction(async (tx) => {
        const moved = await tx.order.updateMany({
          where: { id: order.id, paymentStatus: 'awaiting_payment' },
          data: { paymentStatus: 'paid' },
        });
        if (moved.count !== 1) throw new StalePayment();
        await recordInTransaction(tx, order, payment, note);
      });
      return { outcome: 'applied' };
    } catch (error) {
      if (error instanceof StalePayment) return { outcome: 'stale' };
      return (await referenceTaken(error, payment.reference)) ?? Promise.reject(error);
    }
  },

  async recordCheckout(orders, payment) {
    if (!orders.length) return { outcome: 'stale' };
    try {
      await prisma.$transaction(async (tx) => {
        const ids = orders.map((order) => order.id);
        if (orders.some((order) => order.paymentMethod !== payment.method || order.status !== 'delivered'))
          throw new StalePayment();
        const moved = await tx.order.updateMany({
          where: { id: { in: ids }, status: 'delivered', paymentStatus: 'awaiting_payment' },
          data: { paymentStatus: 'paid' },
        });
        if (moved.count !== orders.length) throw new StalePayment();

        for (const [index, order] of orders.entries()) {
          await recordInTransaction(
            tx,
            order,
            {
              amount: order.totals.total,
              method: payment.method,
              occurredAt: payment.occurredAt,
              reference: index === 0 ? payment.reference : null,
              staffId: payment.staffId,
            },
            `Part du paiement global du panier ${order.checkoutNumber ?? order.number} : ${order.totals.total} FCFA`,
          );
        }
      });
      return { outcome: 'applied' };
    } catch (error) {
      if (error instanceof StalePayment) return { outcome: 'stale' };
      return (await referenceTaken(error, payment.reference)) ?? Promise.reject(error);
    }
  },
};
