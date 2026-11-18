import { ConflictError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { toOrderDto } from '../orders/orders.dto.js';
import type { OrdersRepository, PaymentMethod } from '../orders/orders.repository.js';
import type { PaymentsRepository } from './payments.repository.js';
import { PAYMENT_LABEL } from './payments.rules.js';

/** Côté client : changer de moyen de paiement (8.6), le paiement se faisant à la réception. */
export const createPaymentsService = (orders: OrdersRepository, payments: PaymentsRepository) => ({
  async changeMethod(customerId: string, orderId: string, method: PaymentMethod) {
    const order = await orders.findForCustomer(orderId, customerId);
    if (!order) throw new NotFoundError('Commande introuvable.');
    if (order.paymentMethod === method) throw new UnprocessableError('C’est déjà le moyen de paiement choisi.');
    if (order.paymentStatus !== 'awaiting_payment' || order.status === 'delivered' || order.status === 'cancelled')
      throw new ConflictError('Le moyen de paiement ne peut plus être changé pour cette commande.');
    const note = `Moyen de paiement changé par le client : ${PAYMENT_LABEL[order.paymentMethod]} remplacé par ${PAYMENT_LABEL[method]}`;
    if (!(await payments.changeMethod(order, method, note)))
      throw new ConflictError('La commande a changé entre-temps : rechargez la page.');
    return toOrderDto((await orders.findById(order.id)) ?? order);
  },
});

export type PaymentsService = ReturnType<typeof createPaymentsService>;
