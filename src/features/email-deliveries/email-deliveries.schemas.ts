import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

export const listDeliveriesQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({ status: z.enum(['sending', 'sent', 'failed', 'retried']).optional() })
  .strict();

/** Identifiant d'envoi : UUID attribué à la mise en file */
export const deliveryParam = z.object({ id: z.uuid('Envoi invalide.') });
