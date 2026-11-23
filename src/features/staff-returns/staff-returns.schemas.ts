import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

const reason = z.string().trim().min(5, 'Indiquez le motif (5 caractères au moins).').max(500);

export const listStaffReturnsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({
    status: z.enum(['pending', 'refused', 'expected', 'received', 'refund_due', 'refunded', 'closed']).optional(),
  })
  .strict();

export type ListStaffReturnsQuery = z.infer<typeof listStaffReturnsQuery>;

/**
 * Décision de l'administrateur principal (14.2, 14.3). Accepté : la prise en charge des frais de retour est
 * décidée au cas par cas, avec son motif. Refusé : le motif est communiqué au client.
 */
export const returnDecisionBody = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('accepted'),
    decisionReason: reason,
    shippingPaidBy: z.enum(['shop', 'customer']),
    shippingReason: reason,
  }),
  z.strictObject({ status: z.literal('refused'), decisionReason: reason }),
]);

export type ReturnDecisionInput = z.infer<typeof returnDecisionBody>;
