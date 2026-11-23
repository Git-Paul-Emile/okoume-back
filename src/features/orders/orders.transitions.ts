import { ConflictError, UnprocessableError } from '../../core/errors/AppError.js';
import type { OrderRecord, OrderStatus, PaymentStatus } from './orders.repository.js';

/** Cycle de référence d'une commande, hors états d'exception (front/src/features/orders/orders.constants.ts). */
export const ORDER_FLOW: readonly OrderStatus[] = [
  'confirmed',
  'preparing',
  'ready',
  'courier_assigned',
  'shipping',
  'delivered',
];

/**
 * Effet d'une transition sur le stock (cahier des charges, 7.2) :
 * - consume : début de préparation, le stock physique sort et la réservation est consommée ;
 * - release : annulation avant préparation, la réservation est libérée ;
 * - restock : annulation après préparation, les articles reviennent en stock.
 */
export type StockEffect = 'consume' | 'release' | 'restock' | null;

/** Changement à appliquer, calculé à partir de l'état lu ; le dépôt l'applique seulement si l'état n'a pas bougé. */
export interface TransitionPlan {
  from: OrderStatus;
  to: OrderStatus;
  paymentStatus?: PaymentStatus;
  note?: string;
  stock: StockEffect;
  /** Livreur affecté (avec coût réel), retiré (null) ou inchangé (absent) */
  courier?: { id: string; deliveryCost: number | null } | null;
}

export const nextStatus = (status: OrderStatus): OrderStatus | null => {
  const i = ORDER_FLOW.indexOf(status);
  return i >= 0 && i < ORDER_FLOW.length - 1 ? (ORDER_FLOW[i + 1] ?? null) : null;
};

/** La préparation a commencé : le stock physique a déjà été déduit. */
export const preparationStarted = (order: Pick<OrderRecord, 'events'>) =>
  order.events.some((e) => e.status === 'preparing');

export function advancePlan(order: OrderRecord, note?: string): TransitionPlan {
  if (order.status === 'ready') throw new UnprocessableError('Affectez un livreur pour poursuivre la livraison.');
  const to = nextStatus(order.status);
  // Espèces comme Mobile Money : préparation et livraison possibles avant encaissement (8.4, 8.5)
  if (!to) throw new ConflictError('Cette commande ne peut plus avancer.');
  return { from: order.status, to, ...(note ? { note } : {}), stock: to === 'preparing' ? 'consume' : null };
}

/** Annulation : un paiement reçu devient un remboursement à effectuer ; le stock suit l'avancement. */
export function cancelPlan(order: OrderRecord, note: string): TransitionPlan {
  if (order.status === 'delivered' || order.status === 'cancelled')
    throw new ConflictError('Une commande livrée ou déjà annulée ne peut pas être annulée.');
  const refund = order.paymentStatus === 'paid';
  return {
    from: order.status,
    to: 'cancelled',
    note,
    ...(refund ? { paymentStatus: 'refund_due' as const } : {}),
    stock: preparationStarted(order) ? 'restock' : 'release',
  };
}

/** Affectation d'un livreur (9.4) : la commande prête passe « Livreur trouvé », avec le coût réel de la course. */
export function assignCourierPlan(
  order: OrderRecord,
  courier: { id: string; deliveryCost: number | null },
): TransitionPlan {
  if (order.status !== 'ready') throw new ConflictError('Un livreur s’affecte à une commande prête à livrer.');
  return { from: 'ready', to: 'courier_assigned', stock: null, courier };
}

/** Réouverture d'une commande livrée (6.3) : elle repart en livraison, l'historique est conservé. */
export function reopenPlan(order: OrderRecord, reason: string): TransitionPlan {
  if (order.status !== 'delivered') throw new ConflictError('Seule une commande livrée peut être rouverte.');
  return { from: 'delivered', to: 'shipping', note: `Commande rouverte : ${reason}`, stock: null };
}

/** Livraison échouée (9.6), nouvelle tentative : la commande revient « Prête à livrer ». */
export function deliveryRetryPlan(order: OrderRecord, reason: string): TransitionPlan {
  if (order.status !== 'courier_assigned' && order.status !== 'shipping')
    throw new ConflictError('Seule une commande confiée à un livreur peut être déclarée en échec.');
  return {
    from: order.status,
    to: 'ready',
    note: `Échec de livraison : ${reason}. Nouvelle tentative à organiser.`,
    stock: null,
    courier: null,
  };
}
