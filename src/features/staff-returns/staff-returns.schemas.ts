import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

const reason = z.string().trim().min(5, 'Indiquez le motif (5 caractères au moins).').max(500);

export const listStaffReturnsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({
    status: z.enum(['pending', 'refused', 'expected', 'received', 'refund_due', 'refunded', 'closed']).optional(),
  })
  .strict();

export type ListStaffReturnsQuery = z.infer<typeof listStaffReturnsQuery>;

/**
 * Décision de l'administrateur principal (14.2, 14.3). Accepté : la prise en charge des frais de retour est
 * décidée au cas par cas, avec son motif. Refusé : le motif est communiqué au client.
 */
export const returnDecisionBody = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('accepted'),
    decisionReason: reason,
    shippingPaidBy: z.enum(['shop', 'customer']),
    shippingReason: reason,
  }),
  z.strictObject({ status: z.literal('refused'), decisionReason: reason }),
]);

export type ReturnDecisionInput = z.infer<typeof returnDecisionBody>;

/**
 * Inspection après réception (14.3). Conforme : chaque article est classé revendable ou non revendable.
 * Non conforme : le dossier est clôturé sans remboursement, le motif est communiqué au client.
 */
export const inspectionBody = z.discriminatedUnion('outcome', [
  z.strictObject({
    outcome: z.literal('conforming'),
    lines: z
      .array(
        z.strictObject({
          variantId: z.uuid(),
          resaleable: z.int().min(0).max(100),
          unsellable: z.int().min(0).max(100),
        }),
      )
      .min(1)
      .max(50),
    note: z.string().trim().max(1_000).default(''),
  }),
  z.strictObject({ outcome: z.literal('non_conforming'), note: reason }),
]);

export type InspectionInput = z.infer<typeof inspectionBody>;

/** Sortie définitive d'articles non revendables (14.3) : motif, quantité, valeur de référence, date. */
export const writeOffBody = z.strictObject({
  quantity: z.int().min(1).max(10_000),
  reason,
  referenceValue: z.int('Valeur entière en FCFA.').min(0).max(100_000_000),
  occurredAt: z.coerce.date(),
});

export type WriteOffInput = z.infer<typeof writeOffBody>;

export const writeOffParams = z.strictObject({ variantId: z.uuid('Variante invalide.') });
