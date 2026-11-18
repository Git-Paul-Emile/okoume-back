import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { legalNotice, mobileMoneyAccount, socialLinks, supportContacts } from './settings.schemas.js';

export interface ShopInformationRecord {
  mobileMoney: Array<z.infer<typeof mobileMoneyAccount>>;
  mobileMoneyExpiryHours: number;
  support: z.infer<typeof supportContacts>;
  social: Record<string, string>;
  legal: z.infer<typeof legalNotice>;
  supportSlaHigh: number;
  supportSlaNormal: number;
  alertEscalationHours: number;
  reviewAmount: number;
  cashPreparationAlertHours: number;
  assistantMonthlyBudget: number;
}

export const EMPTY_SUPPORT = { whatsapp: '', phone: '', email: '', hours: '', address: '' } as const;
export const EMPTY_LEGAL = { companyName: '', nif: '', rccm: '', vatNote: '' } as const;

/** Les colonnes JSON sont relues avec leur schéma : une valeur inattendue est remplacée par une valeur vide. */
const parsed = <T>(schema: z.ZodType<T>, value: unknown, fallback: T): T => {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
};

export const toInformation = (row: Prisma.ShopInformationGetPayload<object>): ShopInformationRecord => ({
  mobileMoney: parsed(z.array(mobileMoneyAccount), row.mobileMoney, []),
  mobileMoneyExpiryHours: row.mobileMoneyExpiryHours,
  support: parsed(supportContacts, row.support, { ...EMPTY_SUPPORT }),
  social: parsed(socialLinks, row.social, {}),
  legal: parsed(legalNotice, row.legal, { ...EMPTY_LEGAL }),
  supportSlaHigh: row.supportSlaHigh,
  supportSlaNormal: row.supportSlaNormal,
  alertEscalationHours: row.alertEscalationHours,
  reviewAmount: row.reviewAmount,
  cashPreparationAlertHours: row.cashPreparationAlertHours,
  assistantMonthlyBudget: row.assistantMonthlyBudget,
});

/** Contrat des informations de la boutique (ligne unique, créée par la migration). */
export interface InformationRepository {
  get(): Promise<ShopInformationRecord>;
  update(patch: Partial<ShopInformationRecord>): Promise<ShopInformationRecord>;
}

export const informationRepository: InformationRepository = {
  get: async () =>
    toInformation(await prisma.shopInformation.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } })),
  update: async (patch) =>
    toInformation(
      await prisma.shopInformation.upsert({ where: { id: 1 }, update: patch, create: { id: 1, ...patch } }),
    ),
};
