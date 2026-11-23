import { ConflictError, UnprocessableError } from '../../core/errors/AppError.js';
import type { OrderRecord } from '../orders/orders.repository.js';
import type { ReturnItemRecord } from './returns.repository.js';

const DAY_MS = 24 * 60 * 60_000;

/** Motifs proposés au client (front/src/features/orders/orders.constants.ts). */
export const RETURN_REASONS = [
  'Produit endommagé',
  'Produit défectueux',
  'Non conforme à la description',
  'Erreur de taille ou de variante',
  'Autre motif',
] as const;

/** Justificatifs obligatoires uniquement pour ces motifs (14.2). */
export const EVIDENCE_REQUIRED: ReadonlySet<string> = new Set([
  'Produit endommagé',
  'Produit défectueux',
  'Non conforme à la description',
]);

/** Date de livraison : la dernière étape « Livrée » de l'historique (une réouverture la repousse). */
export const deliveredAt = (order: Pick<OrderRecord, 'events'>) =>
  order.events.filter((e) => e.status === 'delivered').at(-1)?.createdAt ?? null;

/** Une demande de retour est possible sur une commande livrée, pendant le délai unique de la boutique. */
export function assertReturnable(order: OrderRecord, now: Date, windowDays: number) {
  const at = deliveredAt(order);
  if (order.status !== 'delivered' || !at) throw new ConflictError('Un retour se demande sur une commande livrée.');
  if (now.getTime() - at.getTime() > windowDays * DAY_MS)
    throw new ConflictError(`Le délai de retour de ${windowDays} jours après la livraison est dépassé.`);
}

/** Articles demandés : présents dans la commande, sans dépasser la quantité achetée. */
export function assertReturnItems(order: OrderRecord, items: ReadonlyArray<{ variantId: string; quantity: number }>) {
  const bought = new Map<string, number>();
  for (const i of order.items) bought.set(i.variantId, (bought.get(i.variantId) ?? 0) + i.quantity);
  const asked = new Map<string, number>();
  for (const i of items) asked.set(i.variantId, (asked.get(i.variantId) ?? 0) + i.quantity);
  for (const [variantId, quantity] of asked)
    if (quantity > (bought.get(variantId) ?? 0))
      throw new UnprocessableError('Un article demandé ne fait pas partie de la commande, ou en quantité supérieure.');
  return [...asked].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * Montant remboursable d'un retour : prix payé des articles retournés, remise du code répartie au prorata.
 * Les frais de livraison sont examinés séparément.
 */
export function returnRefundAmount(order: Pick<OrderRecord, 'items' | 'totals'>, items: readonly ReturnItemRecord[]) {
  const goods = order.totals.subtotal;
  const discounts = order.totals.codeDiscount;
  const returned = items.reduce(
    (sum, r) => sum + (order.items.find((i) => i.variantId === r.variantId)?.unitPrice ?? 0) * r.quantity,
    0,
  );
  return Math.max(0, Math.round(returned - (goods > 0 ? (discounts * returned) / goods : 0)));
}
