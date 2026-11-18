import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

export const listActivityQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({ staffId: z.uuid().optional() })
  .strict();

/** Export de données (18.3) : ce qui sort, sous quelle forme, combien de lignes et pourquoi */
export const exportBody = z.strictObject({
  title: z.string().trim().min(2).max(120),
  format: z.enum(['csv', 'xlsx', 'pdf']),
  rows: z.int().min(0).max(1_000_000),
  reason: z.string().trim().min(10, 'Précisez le motif en quelques mots (10 caractères minimum).').max(300),
});

export type ExportInput = z.infer<typeof exportBody>;
