import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

/** Paiement Mobile Money d'une mise en avant, fait hors plateforme, à vérifier par l'administration (32.10). */
export const declareBoostBody = z.strictObject({
  planId: z.uuid(),
  method: z.enum(['airtel', 'moov']),
  reference: z
    .string()
    .trim()
    .min(4, 'Indiquez la référence de la transaction.')
    .max(60)
    .transform((v) => v.toUpperCase()),
  amount: z.int().positive().max(100_000_000),
});

export type DeclareBoostInput = z.infer<typeof declareBoostBody>;

export const boostsPageQuery = listQuery(['createdAt']).pick({ page: true, limit: true }).strict();

export type BoostsPageQuery = z.infer<typeof boostsPageQuery>;

const planFields = {
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500),
  durationDays: z.int().min(1).max(90),
  price: z.int().min(1).max(100_000_000),
  active: z.boolean(),
  position: z.int().min(0).max(1_000),
};

/** Offre de mise en avant (32.10) : une durée et un prix. */
export const createBoostPlanBody = z.strictObject({
  ...planFields,
  description: planFields.description.default(''),
  active: planFields.active.default(true),
  position: planFields.position.default(0),
});

export type CreateBoostPlanInput = z.infer<typeof createBoostPlanBody>;

export const updateBoostPlanBody = z
  .strictObject(planFields)
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdateBoostPlanInput = z.infer<typeof updateBoostPlanBody>;

export const listBoostsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({ status: z.enum(['pending', 'validated', 'refused']).optional(), shopId: z.uuid().optional() })
  .strict();

export type ListBoostsQuery = z.infer<typeof listBoostsQuery>;

export const boostDecisionBody = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('validated') }),
  z.strictObject({ status: z.literal('refused'), reason: z.string().trim().min(5, 'Indiquez le motif.').max(500) }),
]);

export type BoostDecisionInput = z.infer<typeof boostDecisionBody>;
