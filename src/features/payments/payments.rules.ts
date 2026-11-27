import type { OrderRecord, PaymentMethod } from '../orders/orders.repository.js';
import type { PaymentRecord } from './payments.repository.js';

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  airtel: 'Airtel Money',
  moov: 'Moov Money',
};

export const paidAmount = (payments: readonly PaymentRecord[]) =>
  payments.reduce((sum, p) => sum + p.amount, 0);

/** Encaissement attendu : le total exact de la commande, aucun paiement partiel (cahier des charges, 8.5). */
export const expectedPayment = (order: Pick<OrderRecord, 'totals'>) => order.totals.total;

