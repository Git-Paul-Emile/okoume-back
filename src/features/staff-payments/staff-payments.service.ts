import { ForbiddenError, NotFoundError } from '../../core/errors/AppError.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import { expectedPayment } from '../payments/payments.rules.js';
import type { PaymentRecord, PaymentsRepository } from '../payments/payments.repository.js';
import type { OrdersRepository } from '../orders/orders.repository.js';
import { toStaffOrderDto } from '../staff-orders/staff-orders.dto.js';

const toPaymentDto = (payment: PaymentRecord) => ({
  ...payment,
  occurredAt: payment.occurredAt.toISOString(),
  createdAt: payment.createdAt.toISOString(),
});

/** Read-only payment history for staff. */
export const createStaffPaymentsService = (orders: OrdersRepository, payments: PaymentsRepository) => {
  async function summary(orderId: string) {
    const order = await orders.findById(orderId);
    if (!order) throw new NotFoundError('Commande introuvable.');
    const list = await payments.listForOrder(order.id);
    const paid = list.reduce((sum, payment) => sum + payment.amount, 0);
    const route = order.checkoutNumber
      ? (await orders.findByCheckout(order.checkoutNumber)).filter((stop) => stop.fulfilledBy === 'okoza')
      : [order];
    const checkout =
      route.length > 1
        ? {
            number: order.checkoutNumber,
            total: route.reduce((total, stop) => total + stop.totals.total, 0),
            orders: route.length,
            shops: route.map((stop) => stop.shop?.name ?? 'OKOZA'),
          }
        : null;
    return {
      order: toStaffOrderDto(order),
      payments: list.map(toPaymentDto),
      paid,
      due: Math.max(0, expectedPayment(order) - paid),
      checkout,
    };
  }

  return {
    async get(orderId: string, actor: Grantee) {
      if (!can(actor, 'paiements:consulter')) throw new ForbiddenError();
      return summary(orderId);
    },
  };
};

export type StaffPaymentsService = ReturnType<typeof createStaffPaymentsService>;
