import { listQuery } from '../../core/validation/common.schemas.js';

export const listCustomersQuery = listQuery(['createdAt']).pick({ page: true, limit: true, search: true }).strict();
