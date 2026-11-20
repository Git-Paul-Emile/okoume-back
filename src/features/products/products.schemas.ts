import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

const MAX_PRICE = 100_000_000;
const price = z.coerce.number().int().min(0).max(MAX_PRICE);
// Accepte aussi un booléen : le schéma est idempotent, il peut relire une query déjà validée
const flag = z.union([z.boolean(), z.stringbool()]).default(false);

/** « Taille:M » ; le paramètre peut être répété : attribute=Taille:M&attribute=Taille:L&attribute=Couleur:Bleu. */
const attribute = z.string().regex(/^[^:]{1,40}:[^:]{1,60}$/, 'Filtre d’attribut attendu sous la forme Nom:Valeur.');

/**
 * Recherche du catalogue : pagination, recherche et tri communs (listQuery), filtres propres au catalogue.
 * Tri : price, -price, -createdAt, -discount ; sans tri, pertinence.
 */
export const listProductsQuery = listQuery(['price', 'createdAt', 'discount'])
  .extend({
    category: z.string().trim().min(1).max(80).optional(),
    minPrice: price.optional(),
    maxPrice: price.optional(),
    inStock: flag,
    onSale: flag,
    attribute: z.union([attribute, z.array(attribute).max(20)]).optional(),
    /** Adresse d'une boutique de vendeur, ou « okoume » pour la boutique Okoumé seule (32.1) */
    shop: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Adresse de boutique invalide.')
      .optional(),
  })
  .strict()
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'Le prix minimum dépasse le prix maximum.',
    path: ['minPrice'],
  });

export type ListProductsQuery = z.infer<typeof listProductsQuery>;

export const productSlugParams = z.strictObject({
  slug: z
    .string()
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Adresse de produit invalide.'),
});
