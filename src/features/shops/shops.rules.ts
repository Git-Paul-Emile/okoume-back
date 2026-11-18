const DAY_MS = 24 * 60 * 60 * 1000;

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/**
 * État de l'accès d'une boutique (32.2) :
 * - suspended : décision de l'administration, annonces masquées ;
 * - awaiting_payment : offre payante choisie sans essai ni paiement validé ;
 * - trial, active : période en cours ;
 * - grace : période terminée, annonces encore visibles pendant le délai de grâce ;
 * - expired : annonces masquées, jamais supprimées, jusqu'au renouvellement.
 */
export type AccessState = 'suspended' | 'awaiting_payment' | 'trial' | 'active' | 'grace' | 'expired';

export interface AccessFacts {
  status: 'active' | 'suspended';
  planKind: 'free' | 'paid';
  accessEndsAt: Date | null;
  inTrial: boolean;
}

export function accessState(shop: AccessFacts, now: Date, graceDays: number): AccessState {
  if (shop.status === 'suspended') return 'suspended';
  if (shop.planKind === 'free') return 'active';
  if (!shop.accessEndsAt) return 'awaiting_payment';
  if (now < shop.accessEndsAt) return shop.inTrial ? 'trial' : 'active';
  return now < addDays(shop.accessEndsAt, graceDays) ? 'grace' : 'expired';
}

/** Les annonces d'une boutique ne sont visibles que pendant un accès en cours ou son délai de grâce. */
export const isVisible = (state: AccessState) => state === 'trial' || state === 'active' || state === 'grace';

/**
 * Période ouverte par un paiement validé : elle suit la période en cours si elle n'est pas finie (essai compris),
 * sinon elle commence à la validation. Un vendeur qui paie en avance ne perd aucun jour.
 */
export function nextPeriod(currentEnd: Date | null, validatedAt: Date, periodDays: number) {
  const start = currentEnd && currentEnd > validatedAt ? currentEnd : validatedAt;
  return { start, end: addDays(start, periodDays) };
}

/** Accès payant qui arrive à échéance dans les reminderDays jours et dont le rappel n'est pas encore parti. */
export const reminderDue = (shop: AccessFacts & { reminderSentFor: Date | null }, now: Date, reminderDays: number) =>
  shop.status === 'active' &&
  shop.planKind === 'paid' &&
  !!shop.accessEndsAt &&
  shop.accessEndsAt > now &&
  shop.accessEndsAt <= addDays(now, reminderDays) &&
  shop.reminderSentFor?.getTime() !== shop.accessEndsAt.getTime();
