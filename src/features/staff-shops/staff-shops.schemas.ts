import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

const planFields = {
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500),
  kind: z.enum(['free', 'paid']),
  price: z.int().min(0).max(100_000_000),
  periodDays: z.int().min(1).max(366).nullable(),
  trialDays: z.int().min(0).max(366),
  active: z.boolean(),
  position: z.int().min(0).max(1_000),
};

/**
 * Conditions d'une offre (même règle que la contrainte access_plans_terms_valid) : une offre gratuite n'a ni
 * prix, ni période, ni essai ; une offre payante a un prix et une période. null : conditions valides.
 */
export function planTermsError(plan: {
  kind: 'free' | 'paid';
  price: number;
  periodDays: number | null;
  trialDays: number;
}) {
  if (plan.kind === 'free')
    return plan.price === 0 && plan.periodDays === null && plan.trialDays === 0
      ? null
      : 'Une offre gratuite n’a ni prix, ni durée, ni période d’essai.';
  if (plan.price <= 0) return 'Indiquez le prix de l’offre payante.';
  if (plan.periodDays === null) return 'Indiquez la durée d’une période payée.';
  return null;
}

/** Offre d'accès des boutiques (32.2) : gratuite, ou payante avec sa période et un essai éventuel. */
export const createPlanBody = z
  .strictObject({
    ...planFields,
    description: planFields.description.default(''),
    price: planFields.price.default(0),
    periodDays: planFields.periodDays.default(null),
    trialDays: planFields.trialDays.default(0),
    active: planFields.active.default(true),
    position: planFields.position.default(0),
  })
  .superRefine((plan, ctx) => {
    const error = planTermsError(plan);
    if (error) ctx.addIssue({ code: 'custom', path: ['kind'], message: error });
  });

export type CreatePlanInput = z.infer<typeof createPlanBody>;

/** Les conditions complètes sont vérifiées après fusion avec l'offre existante, par le service. */
export const updatePlanBody = z
  .strictObject(planFields)
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdatePlanInput = z.infer<typeof updatePlanBody>;

export const listShopsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true, search: true })
  .extend({ status: z.enum(['active', 'suspended']).optional() })
  .strict();

export type ListShopsQuery = z.infer<typeof listShopsQuery>;

const reason = z.string().trim().min(5, 'Indiquez le motif.').max(500);

/** Décisions de l'administration sur une boutique : suspension motivée, réactivation, badge « Vendeur vérifié ». */
export const shopActionBody = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('suspend'), reason }),
  z.strictObject({ action: z.literal('reinstate') }),
  z.strictObject({ action: z.literal('verify') }),
  z.strictObject({ action: z.literal('unverify') }),
]);

export type ShopActionInput = z.infer<typeof shopActionBody>;

export const listShopPaymentsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({ status: z.enum(['pending', 'validated', 'refused']).optional(), shopId: z.uuid().optional() })
  .strict();

export type ListShopPaymentsQuery = z.infer<typeof listShopPaymentsQuery>;

export const paymentDecisionBody = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('validated') }),
  z.strictObject({ status: z.literal('refused'), reason }),
]);

export type PaymentDecisionInput = z.infer<typeof paymentDecisionBody>;

/** Délai de grâce après l'échéance et préavis du rappel, en jours (32.2) ; plafond mensuel de vérifications par IA (16.6). */
export const marketplaceSettingsBody = z
  .strictObject({
    graceDays: z.int().min(0).max(60),
    reminderDays: z.int().min(1).max(60),
    aiReviewMonthlyLimit: z.int().min(0).max(1_000_000),
    agreementValidityHours: z.int().min(1).max(720),
    aiChatMonthlyLimit: z.int().min(0).max(10_000_000),
    /** Commission sur les ventes des vendeurs, en pourcentage avec deux décimales au plus (32.6) */
    commissionRate: z.number().min(0).max(100).multipleOf(0.01),
  })
  .partial()
  .refine((s) => Object.keys(s).length > 0, { message: 'Aucune modification envoyée.' });
