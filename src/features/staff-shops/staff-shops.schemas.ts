import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

export const listShopsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true, search: true })
  .extend({ status: z.enum(['active', 'suspended']).optional() })
  .strict();
export type ListShopsQuery = z.infer<typeof listShopsQuery>;

const reason = z.string().trim().min(5, 'Indiquez le motif.').max(500);

export const shopActionBody = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('suspend'), reason }),
  z.strictObject({ action: z.literal('reinstate') }),
  z.strictObject({ action: z.literal('verify') }),
  z.strictObject({ action: z.literal('unverify') }),
]);
export type ShopActionInput = z.infer<typeof shopActionBody>;
