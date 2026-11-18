import { randomReadableCode } from '../../core/security/secrets.js';
import { slugify } from '../../core/text/slugify.js';

const DAY_MS = 24 * 60 * 60_000;
/** Seuils de suspicion d'un parrainage (repris du front, front/src/features/admin/loyalty.rules.ts). */
export const REFERRAL_BURST = 3;
export const REFERRAL_BURST_WINDOW_MS = 7 * DAY_MS;
export const REFERRAL_MIN_TOTAL = 5_000;

/** Code parrain lisible : 3 premières lettres du prénom, sans accent, puis 6 caractères (AWA-7K2Q9X). */
export function referralCode(firstName: string) {
  const letters =
    slugify(firstName)
      .replace(/[^a-z]/g, '')
      .slice(0, 3) || 'oko';
  return `${letters.toUpperCase().padEnd(3, 'X')}-${randomReadableCode(6)}`;
}

/** Code personnel de bienvenue ou d'anniversaire, à usage unique. */
export const personalCode = (prefix: 'MERCI' | 'ANNIV') => `${prefix}-${randomReadableCode(6)}`;

const lastDigits = (phone: string | null) => (phone ?? '').replace(/\D/g, '').slice(-8);
const placeKey = (zoneId: string, landmark: string) => `${zoneId}|${landmark.trim().toLowerCase()}`;

export interface ReferralContext {
  referrer: { phone: string | null; addresses: ReadonlyArray<{ zoneId: string; landmark: string }> };
  referee: { phone: string | null };
  order: { phone: string; zoneId: string; landmark: string; total: number };
  /** Parrainages déjà récompensés ou en attente pour ce parrain dans la fenêtre récente */
  recentReferrals: number;
}

/**
 * Signaux d'une récompense de parrainage suspecte (12.5) : la récompense reste en attente d'une vérification
 * humaine tant qu'un signal est présent. Liste vide : récompense accordée tout de suite.
 */
export function referralSignals({ referrer, referee, order, recentReferrals }: ReferralContext): string[] {
  const signals: string[] = [];
  const referrerPhone = lastDigits(referrer.phone);
  if (referrerPhone && (referrerPhone === lastDigits(referee.phone) || referrerPhone === lastDigits(order.phone)))
    signals.push('Même numéro de téléphone que le parrain');
  if (referrer.addresses.some((a) => placeKey(a.zoneId, a.landmark) === placeKey(order.zoneId, order.landmark)))
    signals.push('Adresse de livraison identique à celle du parrain');
  if (recentReferrals >= REFERRAL_BURST) signals.push(`${recentReferrals} parrainages récompensés en 7 jours`);
  if (order.total < REFERRAL_MIN_TOTAL) signals.push('Première commande de très faible montant');
  return signals;
}

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * Jours d'anniversaire fêtés à cette date (mois et jour, en UTC). Les clients nés un 29 février sont fêtés
 * le 28 février les années non bissextiles.
 */
export function birthdaysOn(date: Date): Array<{ month: number; day: number }> {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const days = [{ month, day }];
  if (month === 2 && day === 28 && !isLeapYear(date.getUTCFullYear())) days.push({ month: 2, day: 29 });
  return days;
}
