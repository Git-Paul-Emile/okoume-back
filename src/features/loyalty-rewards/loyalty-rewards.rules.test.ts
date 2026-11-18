import { describe, expect, it } from 'vitest';
import { birthdaysOn, referralCode, referralSignals, type ReferralContext } from './loyalty-rewards.rules.js';

const context = (overrides: Partial<ReferralContext> = {}): ReferralContext => ({
  referrer: { phone: '077111111', addresses: [{ zoneId: 'z1', landmark: 'Face à la pharmacie' }] },
  referee: { phone: '066222222' },
  order: { phone: '066222222', zoneId: 'z2', landmark: 'Marché de Nkembo', total: 25_000 },
  recentReferrals: 0,
  ...overrides,
});

describe('récompenses de fidélité', () => {
  it('fabrique un code parrain lisible et sans accent', () => {
    expect(referralCode('Grâce')).toMatch(/^GRA-[A-Z2-9]{6}$/);
    expect(referralCode('Jo')).toMatch(/^JOX-/);
  });

  it('accorde un parrainage sans signal, et relève chaque signal de suspicion', () => {
    expect(referralSignals(context())).toEqual([]);
    expect(
      referralSignals(
        context({ order: { phone: '+241 77 11 11 11', zoneId: 'z2', landmark: 'Ailleurs', total: 25_000 } }),
      ),
    ).toEqual(['Même numéro de téléphone que le parrain']);
    expect(
      referralSignals(
        context({ order: { phone: '066222222', zoneId: 'z1', landmark: ' face à la PHARMACIE ', total: 25_000 } }),
      ),
    ).toEqual(['Adresse de livraison identique à celle du parrain']);
    expect(referralSignals(context({ recentReferrals: 3 }))).toEqual(['3 parrainages récompensés en 7 jours']);
    expect(
      referralSignals(context({ order: { phone: '066222222', zoneId: 'z2', landmark: 'Marché', total: 3_000 } })),
    ).toEqual(['Première commande de très faible montant']);
  });

  it('fête les clients nés un 29 février le 28 les années non bissextiles', () => {
    expect(birthdaysOn(new Date('2027-02-28T07:00:00Z'))).toEqual([
      { month: 2, day: 28 },
      { month: 2, day: 29 },
    ]);
    expect(birthdaysOn(new Date('2028-02-28T07:00:00Z'))).toEqual([{ month: 2, day: 28 }]);
    expect(birthdaysOn(new Date('2026-11-04T07:00:00Z'))).toEqual([{ month: 11, day: 4 }]);
  });
});
