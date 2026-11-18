import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

/**
 * Demande envoyée depuis le compte (19.5). L'export se télécharge directement et la suppression se fait
 * depuis le compte, mot de passe redemandé : seules l'accès et la correction passent par l'équipe.
 */
export const createPrivacyRequestBody = z
  .strictObject({
    type: z.enum(['access', 'correction'], 'Choisissez le type de demande.'),
    details: z.string().trim().max(2_000, '2 000 caractères au plus.').default(''),
  })
  .refine((v) => v.type !== 'correction' || v.details.length >= 5, {
    message: 'Indiquez les informations à corriger.',
    path: ['details'],
  });
export type CreatePrivacyRequestInput = z.infer<typeof createPrivacyRequestBody>;

export const accountDeletionBody = z.strictObject({
  password: z.string().min(1, 'Saisissez votre mot de passe.').max(200),
});

export const listPrivacyRequestsQuery = listQuery(['dueAt']).extend({
  status: z.enum(['open', 'received', 'in_progress', 'completed', 'refused']).optional(),
});
export type ListPrivacyRequestsQuery = z.infer<typeof listPrivacyRequestsQuery>;

/** Suivi par l'équipe : une demande traitée ou refusée porte toujours la réponse donnée au client. */
export const updatePrivacyRequestBody = z
  .strictObject({
    status: z.enum(['in_progress', 'completed', 'refused']),
    response: z.string().trim().min(5, 'Rédigez la réponse au client.').max(2_000).optional(),
  })
  .refine((v) => v.status !== 'refused' || v.response !== undefined, {
    message: 'Indiquez le motif du refus.',
    path: ['response'],
  });
export type UpdatePrivacyRequestInput = z.infer<typeof updatePrivacyRequestBody>;
