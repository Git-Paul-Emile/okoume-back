import { NotFoundError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import type { CategoriesService } from '../categories/categories.service.js';
import { toProductDto } from './products.dto.js';
import type { ProductSort, ProductsRepository } from './products.repository.js';
import type { ListProductsQuery } from './products.schemas.js';

/** Tri demandé vers tri du dépôt ; le sens inverse d'un tri sans intérêt (prix ou remise) est ramené au sens utile. */
const SORTS: Record<string, ProductSort> = {
  price: 'price',
  '-price': '-price',
  createdAt: '-createdAt',
  '-createdAt': '-createdAt',
  discount: '-discount',
  '-discount': '-discount',
};

/** Regroupe « Taille:M », « Taille:L », « Couleur:Bleu » en { Taille: [M, L], Couleur: [Bleu] }. */
export function groupAttributes(raw: string | string[] | undefined) {
  const groups: Record<string, string[]> = {};
  for (const pair of raw === undefined ? [] : [raw].flat()) {
    const [key = '', value = ''] = pair.split(':');
    (groups[key.trim()] ??= []).push(value.trim());
  }
  return groups;
}

export const createProductsService = (
  products: ProductsRepository,
  categories: CategoriesService,
  now: () => Date,
) => ({
  /** Catalogue public : uniquement les produits publiés, prix après la promotion en vigueur. */
  async list(query: ListProductsQuery) {
    const at = now();
    const { ids, total } = await products.search(
      {
        search: query.search,
        categorySlug: query.category,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        inStock: query.inStock,
        onSale: query.onSale,
        attributes: groupAttributes(query.attribute),
        sort: query.sort ? (SORTS[query.sort] ?? 'relevance') : 'relevance',
        shop: query.shop,
        page: query.page,
        limit: query.limit,
      },
      at,
    );
    const [records, index] = await Promise.all([products.findByIds(ids), categories.index()]);
    return paginate(
      records.map((p) => toProductDto(p, index, at)),
      total,
      query.page,
      query.limit,
    );
  },

  async getBySlug(slug: string) {
    const product = await products.findPublishedBySlug(slug, now());
    if (!product) throw new NotFoundError('Ce produit n’existe pas ou n’est plus en vente.');
    return toProductDto(product, await categories.index(), now());
  },
});

export type ProductsService = ReturnType<typeof createProductsService>;
