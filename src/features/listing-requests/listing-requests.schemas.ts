import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';
import { gabonPhone } from '../auth/auth.schemas.js';

/**
 * Demande de commande sur une annonce (32.7). Le prix est celui de l'annonce : un prix négocié dans le tchat
 * s'y ajoutera (32.5). Moyen de paiement et mode de remise : parmi ceux que propose la boutique.
 */
export const createRequestBody = z.strictObject({
  listingSlug: z.string().regex(/^[a-z0-9-]{1,140}$/, 'Annonce invalide.'),
  /** Quantité d'un produit ; null pour un service */
  quantity: z.int().min(1).max(1_000).nullable().default(null),
  paymentMethod: z.enum(['cash', 'airtel', 'moov']),
  handover: z.enum(['pickup', 'seller_delivery']),
  /** Numéro où le vendeur joindra l'acheteur, montré seulement après acceptation */
  contactPhone: gabonPhone,
  message: z.string().trim().max(1_000).default(''),
});

export type CreateRequestInput = z.infer<typeof createRequestBody>;

const reason = z.string().trim().min(5, 'Indiquez le motif.').max(500);

/** L'acheteur annule tant que la vente n'est pas conclue ; le motif est facultatif. */
export const buyerActionBody = z.strictObject({
  action: z.literal('cancel'),
  reason: z.string().trim().max(500).optional(),
});

/** Décisions du vendeur : accepter, refuser (motivé), déclarer la vente conclue ou non conclue (motivé). */
export const sellerActionBody = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('accept') }),
  z.strictObject({ action: z.literal('refuse'), reason }),
  z.strictObject({ action: z.literal('conclude') }),
  z.strictObject({ action: z.literal('not_concluded'), reason }),
]);

export type SellerActionInput = z.infer<typeof sellerActionBody>;

export const listRequestsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({ status: z.enum(['sent', 'accepted', 'refused', 'cancelled', 'concluded', 'not_concluded']).optional() })
  .strict();

export type ListRequestsQuery = z.infer<typeof listRequestsQuery>;
