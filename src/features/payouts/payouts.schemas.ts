import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

export const listPayoutsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({
    shopId: z.uuid().optional(),
    status: z.enum(['pending', 'paid', 'cancelled']).optional(),
  })
  .strict();

export type ListPayoutsQuery = z.infer<typeof listPayoutsQuery>;

export const sellerPayoutsQuery = listPayoutsQuery.omit({ shopId: true });

/** Reversement fait au vendeur : moyen utilisé, et référence de la transaction pour le Mobile Money. */
export const markPayoutPaidBody = z.strictObject({
  method: z.enum(['cash', 'airtel', 'moov'], 'Choisissez le moyen du reversement.'),
  reference: z.string().trim().min(3, 'Référence de 3 caractères au moins.').max(80).nullable().default(null),
});

export type MarkPayoutPaidInput = z.infer<typeof markPayoutPaidBody>;
