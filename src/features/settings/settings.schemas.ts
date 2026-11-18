import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);

export const mobileMoneyAccount = z.strictObject({
  method: z.enum(['airtel', 'moov']),
  label: text(40).min(2),
  number: text(30).min(6),
  beneficiary: text(80).min(2),
  instructions: text(500),
});

export const supportContacts = z.strictObject({
  whatsapp: text(20),
  phone: text(30),
  email: z.union([z.email().max(254), z.literal('')]),
  hours: text(120),
  address: text(200),
});

export const socialLinks = z.record(
  z.string().regex(/^[a-z]{2,20}$/, 'Nom de réseau en minuscules.'),
  z.url({ protocol: /^https$/, message: 'Adresse HTTPS attendue.' }).max(300),
);

export const legalNotice = z.strictObject({
  companyName: text(120),
  nif: text(40),
  rccm: text(40),
  vatNote: text(500),
});

/**
 * Modification par l'administrateur principal : seuls les champs envoyés changent. Un compte Mobile Money par
 * opérateur au plus, pour que l'instruction de paiement montrée au client soit sans ambiguïté.
 */
export const updateInformationBody = z
  .strictObject({
    mobileMoney: z
      .array(mobileMoneyAccount)
      .max(2)
      .refine((list) => new Set(list.map((a) => a.method)).size === list.length, 'Un compte par opérateur.'),
    mobileMoneyExpiryHours: z.int().min(1).max(168),
    support: supportContacts,
    social: socialLinks,
    legal: legalNotice,
    supportSlaHigh: z.int().min(1).max(168),
    supportSlaNormal: z.int().min(1).max(336),
    alertEscalationHours: z.int().min(1).max(168),
    reviewAmount: z.int().min(0).max(1_000_000_000),
    cashPreparationAlertHours: z.int().min(1).max(168),
    assistantMonthlyBudget: z.int().min(0).max(10_000_000),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdateInformationInput = z.infer<typeof updateInformationBody>;
