import type { CategoryRecord } from '../categories/categories.repository.js';
import { rootOf } from '../categories/categories.service.js';
import { isPromotionActive, salePrice } from './products.pricing.js';
import type { ProductRecord } from './products.repository.js';

/**
 * Variante publique. Le stock exact, les réservations et le stock non revendable restent internes :
 * le client voit seulement la quantité disponible à la vente.
 */
export interface VariantDto {
  id: string;
  sku: string;
  label: string;
  attributes: Record<string, string>;
  price: number;
  salePrice: number;
  available: number;
  availability: 'in_stock' | 'low_stock' | 'out_of_stock';
  image: string | null;
}

export interface ProductDto {
  id: string;
  slug: string;
  name: string;
  sku: string;
  categoryId: string;
  rootCategoryId: string;
  brand: string | null;
  shortDescription: string;
  description: string[];
  specs: Array<{ label: string; value: string }>;
  usageTips: string | null;
  tax: { vatRate: number; hsCode: string | null };
  images: string[];
  thumbnail: string | null;
  variants: VariantDto[];
  promotion: { type: 'percent' | 'fixed'; value: number; startsAt: string; endsAt: string } | null;
  dealOfTheDay: boolean;
  featured: boolean;
  isNew: boolean;
  tags: string[];
  /** Boutique qui vend (32.1) : null pour la boutique OKOZA */
  seller: { slug: string; name: string } | null;
  condition: 'new' | 'like_new' | 'good' | 'used' | null;
  createdAt: string;
}

export function toProductDto(p: ProductRecord, categories: ReadonlyMap<string, CategoryRecord>, now: Date): ProductDto {
  // Une promotion terminée ou à venir n'est pas annoncée
  const promotion = isPromotionActive(p.promotion, now) ? p.promotion : null;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    sku: p.sku,
    categoryId: p.categoryId,
    rootCategoryId: rootOf(p.categoryId, categories),
    brand: p.brand,
    shortDescription: p.shortDescription,
    description: p.description,
    specs: p.specs,
    usageTips: p.usageTips,
    tax: { vatRate: p.vatRate, hsCode: p.hsCode },
    images: p.images,
    thumbnail: p.images[0] ?? null,
    variants: p.variants.map((v) => {
      const available = Math.max(0, v.stock - v.reserved);
      return {
        id: v.id,
        sku: v.sku,
        label: v.label,
        attributes: v.attributes,
        price: v.price,
        salePrice: salePrice(v.price, promotion, now),
        available,
        availability: available === 0 ? 'out_of_stock' : available <= v.lowStockThreshold ? 'low_stock' : 'in_stock',
        image: v.image,
      };
    }),
    promotion: promotion && {
      type: promotion.type,
      value: promotion.value,
      startsAt: promotion.startsAt.toISOString(),
      endsAt: promotion.endsAt.toISOString(),
    },
    dealOfTheDay: p.dealOfTheDay,
    featured: p.featured,
    isNew: p.isNew,
    tags: p.tags,
    seller: p.seller && { slug: p.seller.slug, name: p.seller.name },
    condition: p.condition,
    createdAt: p.createdAt.toISOString(),
  };
}
