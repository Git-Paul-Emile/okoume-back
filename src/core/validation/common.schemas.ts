import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export const idParam = z.strictObject({ id: z.uuid('Identifiant invalide.') });

/**
 * Paramètres communs à toute collection (rules/10-stack/api.md) : pagination, recherche et tri.
 * Les champs de tri autorisés sont une liste blanche propre à chaque route.
 */
export const listQuery = <Sort extends string>(sortable: readonly [Sort, ...Sort[]]) =>
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    search: z.string().trim().min(1).max(100).optional(),
    sort: z
      .string()
      .regex(/^-?[A-Za-z]+$/, 'Tri invalide.')
      .refine((value) => sortable.includes(value.replace(/^-/, '') as Sort), 'Tri non autorisé.')
      .optional(),
  });

export type ListQuery = z.infer<ReturnType<typeof listQuery>>;

/** Traduit `-createdAt` en { field: 'createdAt', direction: 'desc' }. */
export const parseSort = (sort: string | undefined) =>
  sort
    ? { field: sort.replace(/^-/, ''), direction: sort.startsWith('-') ? ('desc' as const) : ('asc' as const) }
    : null;
