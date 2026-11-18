import { describe, expect, it } from 'vitest';
import { accessState, addDays, isVisible, nextPeriod, reminderDue, type AccessState } from './shops.rules.js';

const now = new Date('2026-11-10T10:00:00.000Z');
const paid = (accessEndsAt: Date | null, inTrial = false) =>
  ({ status: 'active', planKind: 'paid', accessEndsAt, inTrial }) as const;

describe('état de l’accès d’une boutique', () => {
  it('une offre gratuite reste active sans échéance', () => {
    expect(accessState({ status: 'active', planKind: 'free', accessEndsAt: null, inTrial: false }, now, 3)).toBe(
      'active',
    );
  });

  it('suit l’essai, la période payée, le délai de grâce puis l’expiration', () => {
    expect(accessState(paid(null), now, 3)).toBe('awaiting_payment');
    expect(accessState(paid(addDays(now, 2), true), now, 3)).toBe('trial');
    expect(accessState(paid(addDays(now, 2)), now, 3)).toBe('active');
    expect(accessState(paid(addDays(now, -2)), now, 3)).toBe('grace');
    expect(accessState(paid(addDays(now, -3)), now, 3)).toBe('expired');
  });

  it('une suspension l’emporte sur tout le reste', () => {
    expect(accessState({ ...paid(addDays(now, 30)), status: 'suspended' }, now, 3)).toBe('suspended');
  });

  it('ne montre les annonces que pendant l’essai, la période et la grâce', () => {
    const shown: AccessState[] = ['trial', 'active', 'grace'];
    const hidden: AccessState[] = ['expired', 'suspended', 'awaiting_payment'];
    expect(shown.every(isVisible)).toBe(true);
    expect(hidden.some(isVisible)).toBe(false);
  });
});

describe('période ouverte par un paiement validé', () => {
  it('prolonge une période en cours sans perdre de jour', () => {
    expect(nextPeriod(addDays(now, 10), now, 30)).toEqual({ start: addDays(now, 10), end: addDays(now, 40) });
  });

  it('repart de la validation quand l’accès est fini ou absent', () => {
    expect(nextPeriod(addDays(now, -5), now, 30)).toEqual({ start: now, end: addDays(now, 30) });
    expect(nextPeriod(null, now, 30)).toEqual({ start: now, end: addDays(now, 30) });
  });
});

describe('rappel d’échéance', () => {
  it('part une fois par échéance, dans le préavis, pour un accès payant actif', () => {
    const ends = addDays(now, 4);
    expect(reminderDue({ ...paid(ends), reminderSentFor: null }, now, 5)).toBe(true);
    expect(reminderDue({ ...paid(ends), reminderSentFor: ends }, now, 5)).toBe(false);
    expect(reminderDue({ ...paid(addDays(now, 6)), reminderSentFor: null }, now, 5)).toBe(false);
    expect(reminderDue({ ...paid(ends), status: 'suspended', reminderSentFor: null }, now, 5)).toBe(false);
  });
});
