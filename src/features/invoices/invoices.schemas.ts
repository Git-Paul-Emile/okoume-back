import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

/** Liste des documents de l'équipe : pagination et recherche communes (numéro, commande, client), type. */
export const listInvoicesQuery = listQuery(['issuedAt'])
  .pick({ page: true, limit: true, search: true })
  .extend({ type: z.enum(['invoice', 'credit_note']).optional() })
  .strict();

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuery>;
