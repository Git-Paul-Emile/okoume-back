import { listQuery } from '../../core/validation/common.schemas.js';

/** Historique des points : pagination commune, du plus récent au plus ancien. */
export const movementsQuery = listQuery(['createdAt']).pick({ page: true, limit: true }).strict();
