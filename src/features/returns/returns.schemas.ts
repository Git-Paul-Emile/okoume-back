import { z } from 'zod';
import { RETURN_REASONS } from './returns.rules.js';

const evidenceUrl = z.url({ protocol: /^https$/, message: 'Adresse de justificatif HTTPS attendue.' }).max(500);

/** Demande de retour (14.2) : commande, produits et quantités ; justificatif pour un produit abîmé ou non conforme. */
export const returnRequestBody = z.strictObject({
  items: z
    .array(z.strictObject({ variantId: z.uuid('Article invalide.'), quantity: z.int().min(1).max(100) }))
    .min(1, 'Choisissez au moins un article.')
    .max(50),
  reason: z.enum(RETURN_REASONS, 'Choisissez un motif de retour.'),
  comment: z.string().trim().max(1_000).default(''),
  evidenceUrls: z.array(evidenceUrl).max(6).default([]),
});

export type ReturnRequestInput = z.infer<typeof returnRequestBody>;

/** Réouverture d'un dossier refusé (14.6) : l'historique initial est conservé. */
export const reopenBody = z.strictObject({
  comment: z.string().trim().min(5, 'Expliquez pourquoi vous demandez la réouverture.').max(1_000),
});
