import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

const STATUSES = ['confirmed', 'preparing', 'ready', 'courier_assigned', 'shipping', 'delivered', 'cancelled'] as const;

export const listSellerOrdersQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true, search: true })
  .extend({ status: z.enum(STATUSES).optional() })
  .strict();

export type ListSellerOrdersQuery = z.infer<typeof listSellerOrdersQuery>;

/** Étape suivante, avec une note facultative gardée dans l'historique de la commande. */
export const advanceSellerOrderBody = z.strictObject({ note: z.string().trim().max(300).optional() });

/** Confirmation de remise physique au livreur de la plateforme. */
export const handoverSellerOrderBody = z.strictObject({});

/** Encaissement à la livraison par le vendeur qui livre lui-même (32.6) : référence pour le Mobile Money. */
export const collectSellerOrderBody = z.strictObject({
  reference: z.string().trim().min(3, 'Référence de 3 caractères au moins.').max(80).nullable().default(null),
});

export type CollectSellerOrderInput = z.infer<typeof collectSellerOrderBody>;

export const cancelSellerOrderBody = z.strictObject({
  reason: z.string().trim().min(5, 'Indiquez le motif de l’annulation (5 caractères au moins).').max(300),
});
