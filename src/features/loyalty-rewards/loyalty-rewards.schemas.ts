import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

/** Préférences du client : date d'anniversaire facultative (null l'efface) et récompense choisie (12.5). */
export const preferencesBody = z
  .strictObject({
    birthDate: z.iso
      .date('Date attendue au format AAAA-MM-JJ.')
      .transform((v) => new Date(`${v}T00:00:00.000Z`))
      .refine((d) => d.getUTCFullYear() >= 1900, 'Date d’anniversaire invalide.')
      .nullable(),
    birthdayChoice: z.enum(['points', 'code']),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Aucune modification envoyée.' });

export type PreferencesInput = z.infer<typeof preferencesBody>;

export const listReferralsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({ status: z.enum(['pending', 'granted', 'rejected']).optional() })
  .strict();

export type ListReferralsQuery = z.infer<typeof listReferralsQuery>;

/** Décision sur une récompense suspecte, avec la raison retenue. */
export const referralDecisionBody = z.strictObject({
  status: z.enum(['granted', 'rejected']),
  note: z.string().trim().min(5, 'Indiquez la raison de la décision.').max(500),
});
