import { z } from 'zod';

const amount = z.int('Montant entier en FCFA, sans décimales.').min(1).max(100_000_000);
const reference = z.string().trim().min(3, 'Référence de 3 caractères au moins.').max(80);

/**
 * Encaissement vérifié (8.4, 8.5) : montant, date de réception, référence externe pour Mobile Money.
 * Pas de champ d'observations (retiré du cahier des charges) ; l'auteur est la personne connectée.
 */
export const recordPaymentBody = z.strictObject({
  amount,
  receivedAt: z.coerce.date(),
  reference: reference.nullable().default(null),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentBody>;

/**
 * Remboursement effectué (14.4) : référence obligatoire, sauf exception justifiée ; un autre moyen que le
 * paiement initial demande l'accord du client.
 */
export const refundBody = z
  .strictObject({
    amount,
    method: z.enum(['cash', 'airtel', 'moov']),
    refundedAt: z.coerce.date(),
    reference: reference.nullable().default(null),
    noReferenceReason: z.string().trim().min(5).max(300).nullable().default(null),
    clientAgreed: z.boolean().default(false),
  })
  .refine((r) => r.reference !== null || r.noReferenceReason !== null, {
    message: 'La référence du remboursement est obligatoire, sauf exception justifiée.',
    path: ['reference'],
  });

export type RefundInput = z.infer<typeof refundBody>;
