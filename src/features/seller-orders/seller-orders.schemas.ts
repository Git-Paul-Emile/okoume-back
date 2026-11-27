import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

const STATUSES = ['confirmed', 'preparing', 'ready', 'courier_assigned', 'shipping', 'delivered'] as const;

export const listSellerOrdersQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true, search: true })
  .extend({ status: z.enum(STATUSES).optional() })
  .strict();

export type ListSellerOrdersQuery = z.infer<typeof listSellerOrdersQuery>;

/** Étape suivante, avec une note facultative gardée dans l'historique de la commande. */
export const advanceSellerOrderBody = z.strictObject({ note: z.string().trim().max(300).optional() });

/** Confirmation de remise physique au livreur de la plateforme. */
export const handoverSellerOrderBody = z.strictObject({});
