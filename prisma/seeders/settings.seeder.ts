import { z } from 'zod';
import {
  legalNotice,
  mobileMoneyAccount,
  socialLinks,
  supportContacts,
} from '../../src/features/settings/settings.schemas.js';
import { readData, type Seeder } from './support.js';

const schema = z.object({
  maxDiscountRate: z.number().gt(0).max(1),
  tiers: z.array(z.object({ id: z.enum(['bronze', 'argent', 'or']), threshold: z.number().int().min(0) })),
  mobileMoney: z.array(mobileMoneyAccount),
  mobileMoneyExpiryHours: z.number().int().min(1),
  support: supportContacts,
  social: socialLinks,
  legal: legalNotice,
  supportSla: z.object({ high: z.number().int().min(1), normal: z.number().int().min(1) }),
  alertEscalationHours: z.number().int().min(1),
  reviewAmount: z.number().int().min(0),
  cashPreparationAlertHours: z.number().int().min(1),
  assistantMonthlyBudget: z.number().int().min(0),
});

/** Contenu validé de data/settings.json */
export const loadSettings = () => readData('settings.json', schema);

/**
 * Réglages de la boutique : plafond de remise et seuils des niveaux de fidélité, puis informations publiques
 * (Mobile Money, contacts, réseaux, mentions légales) et délais. Une ligne déjà là n'est pas modifiée.
 */
export const settingsSeeder: Seeder = {
  name: 'settings',
  demo: false,
  async run({ prisma }) {
    const settings = loadSettings();
    const threshold = (tier: 'argent' | 'or') => {
      const found = settings.tiers.find((t) => t.id === tier);
      if (!found) throw new Error(`data/settings.json : niveau « ${tier} » absent`);
      return found.threshold;
    };
    const { count } = await prisma.shopSettings.createMany({
      data: [
        {
          id: 1,
          maxDiscountRate: settings.maxDiscountRate,
          silverThreshold: threshold('argent'),
          goldThreshold: threshold('or'),
        },
      ],
      skipDuplicates: true,
    });
    // La migration crée une ligne vide : elle n'est complétée que tant qu'aucun compte Mobile Money n'y figure
    const info = await prisma.shopInformation.findUnique({ where: { id: 1 }, select: { mobileMoney: true } });
    const empty = !info || (Array.isArray(info.mobileMoney) && info.mobileMoney.length === 0);
    if (empty) {
      const data = {
        mobileMoney: settings.mobileMoney,
        mobileMoneyExpiryHours: settings.mobileMoneyExpiryHours,
        support: settings.support,
        social: settings.social,
        legal: settings.legal,
        supportSlaHigh: settings.supportSla.high,
        supportSlaNormal: settings.supportSla.normal,
        alertEscalationHours: settings.alertEscalationHours,
        reviewAmount: settings.reviewAmount,
        cashPreparationAlertHours: settings.cashPreparationAlertHours,
        assistantMonthlyBudget: settings.assistantMonthlyBudget,
      };
      await prisma.shopInformation.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
    }
    return count + (empty ? 1 : 0);
  },
};
