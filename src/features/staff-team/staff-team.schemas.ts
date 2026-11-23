import { z } from 'zod';
import { email } from '../auth/auth.schemas.js';

/** Plafond de remboursement délégué (14.5), en FCFA ; null : pas de délégation */
const refundLimit = z.int().min(0).max(100_000_000).nullable();

export const inviteMemberBody = z.strictObject({
  email,
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  refundLimit: refundLimit.default(null),
});
export type InviteMemberInput = z.infer<typeof inviteMemberBody>;

export const updateMemberBody = z
  .strictObject({
    status: z.enum(['active', 'suspended']),
    refundLimit,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Aucune modification.');
export type UpdateMemberInput = z.infer<typeof updateMemberBody>;

export const backupCodeResetBody = z.strictObject({
  reason: z.string().trim().min(5, 'Indiquez comment l’identité du membre a été vérifiée.').max(300),
});
