import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

export const openConversationBody = z.strictObject({
  listingSlug: z.string().regex(/^[a-z0-9-]{1,140}$/, 'Annonce invalide.'),
});

/** Message du tchat : du texte seul, jamais de pièce jointe ni de donnée de paiement attendue. */
export const messageBody = z.strictObject({
  body: z.string().trim().min(1, 'Message vide.').max(1_000, '1 000 caractères au plus.'),
});

/** Suivi des nouveaux messages : ceux écrits après since (date ISO du dernier message reçu). */
export const messagesQuery = z.strictObject({ since: z.iso.datetime().optional() });

export const buyerConversationAction = z.strictObject({ action: z.literal('close') });

export const listConversationsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({ needsSeller: z.union([z.boolean(), z.stringbool()]).optional() })
  .strict();

export type ListConversationsQuery = z.infer<typeof listConversationsQuery>;

/** Prix proposé par le vendeur lui-même dans la conversation, au plus le prix affiché. */
export const sellerAgreementBody = z.strictObject({ price: z.int().min(1).max(1_000_000_000) });
