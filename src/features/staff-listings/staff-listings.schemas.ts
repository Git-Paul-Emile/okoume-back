import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

export const listListingsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({
    status: z
      .enum([
        'draft',
        'in_review',
        'changes_requested',
        'pending_moderation',
        'published',
        'rejected',
        'withdrawn',
        'sold',
      ])
      .default('pending_moderation'),
    shopId: z.uuid().optional(),
  })
  .strict();

export type ListListingsQuery = z.infer<typeof listListingsQuery>;

const reason = z.string().trim().min(5, 'Indiquez le motif.').max(1_000);

/**
 * Décision humaine sur une annonce (32.3, 13.3) : publier, demander une correction, refuser définitivement, ou
 * masquer une annonce publiée le temps d'un examen (risque sérieux, 13.4). Le motif est donné au vendeur.
 */
export const listingDecisionBody = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('approve') }),
  z.strictObject({ decision: z.literal('request_changes'), reason }),
  z.strictObject({ decision: z.literal('reject'), reason }),
  z.strictObject({ decision: z.literal('hide'), reason }),
]);

export type ListingDecisionInput = z.infer<typeof listingDecisionBody>;

export const listReportsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({ status: z.enum(['open', 'dismissed', 'upheld']).default('open'), listingId: z.uuid().optional() })
  .strict();

export type ListReportsQuery = z.infer<typeof listReportsQuery>;

/** Classement d'un signalement ; l'action sur l'annonce elle-même passe par sa décision. */
export const reportDecisionBody = z.strictObject({ status: z.enum(['dismissed', 'upheld']) });
