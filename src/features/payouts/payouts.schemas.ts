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
export type SellerPayoutsQuery = z.infer<typeof sellerPayoutsQuery>;
