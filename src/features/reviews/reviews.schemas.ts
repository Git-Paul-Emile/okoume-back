import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

/** Motifs de refus prévus par la charte de modération (13.3) : le client voit celui qui s'applique. */
export const REVIEW_REJECTION_REASONS = [
  'Spam, publicité ou répétition abusive',
  'Insultes, menaces ou propos discriminatoires',
  'Divulgation de données personnelles',
  'Avis frauduleux ou achat non vérifiable',
  'Photos inappropriées, dangereuses ou sans rapport',
] as const;

export const productIdParam = z.object({ productId: z.uuid('Produit invalide.') });

export const reviewBody = z.strictObject({
  rating: z.number().int().min(1, 'Choisissez une note de 1 à 5 étoiles.').max(5),
  comment: z
    .string()
    .trim()
    .min(10, 'Décrivez votre expérience en quelques mots (10 caractères minimum).')
    .max(2_000, '2 000 caractères au plus.'),
  /** Photos déjà envoyées chez l'hébergeur avec l'autorisation de l'API */
  photos: z
    .array(z.url({ protocol: /^https$/, message: 'Adresse HTTPS attendue.' }).max(500))
    .max(3, '3 photos au plus.')
    .default([]),
});
export type ReviewInput = z.infer<typeof reviewBody>;

export const listProductReviewsQuery = listQuery(['createdAt']).pick({ page: true, limit: true }).strict();

export const listStaffReviewsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
  })
  .strict();
export type ListStaffReviewsQuery = z.infer<typeof listStaffReviewsQuery>;

export const decideReviewBody = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('approved') }),
  z.strictObject({
    status: z.literal('rejected'),
    rejectionReason: z.enum(REVIEW_REJECTION_REASONS),
    /** Précision facultative pour le client, ajoutée au motif de la charte */
    detail: z.string().trim().max(200, '200 caractères au plus.').default(''),
  }),
]);
export type DecideReviewInput = z.infer<typeof decideReviewBody>;
