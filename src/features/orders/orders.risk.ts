/**
 * Commandes suspectes (19.3) : signaux calculés à la création. Ils ne refusent jamais une commande : ils la
 * mettent « à vérifier », et la préparation attend qu'un membre de l'équipe la valide.
 */

/** Quantité d'un même article au-delà de laquelle la commande est vérifiée */
export const UNUSUAL_QUANTITY = 5;
/** Commandes d'un même numéro sur 24 heures, celle-ci comprise */
export const REPEATED_ORDERS = 3;
/** Adresses e-mail différentes utilisées avec un même numéro sur 30 jours */
export const SHARED_PHONE_EMAILS = 2;
/** Commandes annulées d'un même numéro sur 30 jours */
export const REPEATED_CANCELLATIONS = 2;
/** Part du sous-total couverte par les remises (code, points) */
export const STRONG_DISCOUNT = 0.4;

export const DAY_MS = 24 * 60 * 60_000;
export const HISTORY_DAYS = 30;

export interface RiskInput {
  total: number;
  subtotal: number;
  discounts: number;
  quantities: number[];
}

/** Historique du numéro de téléphone, sans la commande en cours */
export interface RiskHistory {
  /** Commandes des dernières 24 heures */
  recentOrders: number;
  /** Autres adresses e-mail utilisées sur 30 jours */
  otherEmails: number;
  /** Commandes annulées sur 30 jours */
  cancelledOrders: number;
}

/** Motifs lisibles par l'équipe ; tableau vide : rien à vérifier. */
export function suspicionReasons(order: RiskInput, history: RiskHistory, reviewAmount: number): string[] {
  const reasons: string[] = [];
  if (reviewAmount > 0 && order.total >= reviewAmount) reasons.push('Montant élevé');
  if (order.quantities.some((q) => q >= UNUSUAL_QUANTITY)) reasons.push('Quantité inhabituelle d’un même article');
  if (history.recentOrders + 1 >= REPEATED_ORDERS) reasons.push('Commandes répétées sur le même numéro en 24 h');
  if (history.otherEmails + 1 >= SHARED_PHONE_EMAILS) reasons.push('Numéro utilisé avec plusieurs adresses e-mail');
  if (history.cancelledOrders >= REPEATED_CANCELLATIONS) reasons.push('Annulations répétées sur ce numéro');
  if (order.subtotal > 0 && order.discounts / order.subtotal >= STRONG_DISCOUNT) reasons.push('Remise très forte');
  return reasons;
}
