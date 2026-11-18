import { z } from 'zod';
import { categoryId } from './categories.seeder.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const variantSchema = z.object({
  id: z.string(),
  sku: z.string().min(1),
  label: z.string().min(1),
  attributes: z.record(z.string(), z.string()),
  price: z.number().int().min(0),
  cost: z.number().int().positive().nullable().optional(),
  stock: z.number().int().min(0),
  reserved: z.number().int().min(0),
  lowStockThreshold: z.number().int().min(0),
  image: z.string().nullable(),
});

const schema = z.array(
  z.object({
    id: z.string(),
    slug: z.string().min(1),
    name: z.string().min(1),
    sku: z.string().min(1),
    categoryId: z.string(),
    brand: z.string().nullable(),
    shortDescription: z.string(),
    description: z.array(z.string()),
    specs: z.array(z.object({ label: z.string(), value: z.string() })),
    usageTips: z.string().nullable(),
    images: z.array(z.string()),
    variants: z.array(variantSchema).min(1),
    promotion: z
      .object({ type: z.enum(['percent', 'fixed']), value: z.number().positive(), startsAt: isoDate, endsAt: isoDate })
      .nullable(),
    dealOfTheDay: z.boolean(),
    featured: z.boolean(),
    isNew: z.boolean(),
    tags: z.array(z.string()),
    status: z.enum(['draft', 'published', 'archived']),
    createdAt: isoDate,
  }),
);

/** Contenu validé de data/products.json */
export const loadProducts = () => readData('products.json', schema);

export const productId = (legacyId: string) => legacyUuid('product', legacyId);
export const variantId = (legacyId: string) => legacyUuid('variant', legacyId);

/** Fiches produits, photos et variantes avec leur stock. Les produits associés (relatedIds) ne sont pas encore modélisés. */
export const productsSeeder: Seeder = {
  name: 'products',
  demo: true,
  async run({ prisma }) {
    const products = loadProducts();
    const { count } = await prisma.product.createMany({
      data: products.map((p) => ({
        id: productId(p.id),
        slug: p.slug,
        name: p.name,
        sku: p.sku,
        categoryId: categoryId(p.categoryId),
        brand: p.brand,
        shortDescription: p.shortDescription,
        description: p.description,
        specs: p.specs,
        usageTips: p.usageTips,
        status: p.status,
        featured: p.featured,
        dealOfTheDay: p.dealOfTheDay,
        isNew: p.isNew,
        tags: p.tags,
        promotionType: p.promotion?.type ?? null,
        promotionValue: p.promotion?.value ?? null,
        promotionStartsAt: p.promotion?.startsAt ?? null,
        promotionEndsAt: p.promotion?.endsAt ?? null,
        createdAt: p.createdAt,
      })),
      skipDuplicates: true,
    });
    await prisma.productImage.createMany({
      data: products.flatMap((p) =>
        p.images.map((url, position) => ({
          id: legacyUuid('product-image', `${p.id}:${position}`),
          productId: productId(p.id),
          url,
          alt: p.name,
          position,
        })),
      ),
      skipDuplicates: true,
    });
    await prisma.variant.createMany({
      data: products.flatMap((p) =>
        p.variants.map((v, position) => ({
          id: variantId(v.id),
          productId: productId(p.id),
          sku: v.sku,
          label: v.label,
          attributes: v.attributes,
          price: v.price,
          cost: v.cost ?? null,
          stock: v.stock,
          reserved: v.reserved,
          lowStockThreshold: v.lowStockThreshold,
          image: v.image,
          position,
        })),
      ),
      skipDuplicates: true,
    });
    return count;
  },
};
