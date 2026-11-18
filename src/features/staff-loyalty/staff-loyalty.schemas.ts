import { z } from 'zod';

/** Correction manuelle (12.3) : nombre entier non nul, positif ou négatif, motif obligatoire. */
export const adjustmentBody = z.strictObject({
  points: z
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((p) => p !== 0, 'Indiquez un nombre de points non nul.'),
  reason: z.string().trim().min(5, 'Indiquez le motif de la correction.').max(300),
});

/**
 * Réglages de la fidélité (12.4) et plafond des réductions, par l'administrateur principal.
 * Le niveau des clients se recalcule à la lecture : un changement de seuil s'applique aussitôt.
 */
export const loyaltySettingsBody = z
  .strictObject({
    maxDiscountRate: z.number().min(0.05).max(1),
    silverThreshold: z.int().min(1).max(1_000_000_000),
    goldThreshold: z.int().min(1).max(1_000_000_000),
    /** Taux de TVA de la livraison (25.4) : vaut pour les factures émises ensuite, jamais pour les anciennes */
    deliveryVatRate: z.number().min(0).max(100),
    /** Récompenses (12.5) */
    referralReward: z.int().min(0).max(100_000),
    welcomeEnabled: z.boolean(),
    welcomePercent: z.int().min(1).max(90),
    welcomeValidDays: z.int().min(1).max(365),
    birthdayEnabled: z.boolean(),
    birthdayPoints: z.int().min(0).max(100_000),
    birthdayPercent: z.int().min(1).max(90),
    birthdayValidDays: z.int().min(1).max(365),
  })
  .partial()
  .refine((s) => Object.keys(s).length > 0, { message: 'Aucune modification envoyée.' });

export type LoyaltySettingsInput = z.infer<typeof loyaltySettingsBody>;

export const customerParams = z.strictObject({ customerId: z.uuid('Client invalide.') });
