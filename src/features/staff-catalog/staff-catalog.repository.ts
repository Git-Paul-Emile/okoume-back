import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import {
  productInclude,
  toProductRecord,
  type ProductRecord,
  type VariantRecord,
} from '../products/products.repository.js';

/** Variante vue par l'équipe : données publiques, plus coût d'achat et stock non revendable. */
export interface StaffVariantRecord extends VariantRecord {
  cost: number | null;
  unsellable: number;
}

export interface StaffProductRecord extends Omit<ProductRecord, 'variants'> {
  variants: StaffVariantRecord[];
  updatedAt: Date;
}

export interface NewVariant {
  sku: string;
  label: string;
  attributes: Record<string, string>;
  price: number;
  cost: number | null;
  stock: number;
  lowStockThreshold: number;
  image: string | null;
  weightGrams: number | null;
}

export interface ProductFields {
  name: string;
  categoryId: string;
  brand: string | null;
  shortDescription: string;
  description: string[];
  specs: Array<{ label: string; value: string }>;
  usageTips: string | null;
  vatRate: number;
  hsCode: string | null;
  featured: boolean;
  isNew: boolean;
  dealOfTheDay: boolean;
  tags: string[];
  promotion: ProductRecord['promotion'];
}

export interface NewProduct extends ProductFields {
  slug: string;
  sku: string;
  status: 'draft' | 'published';
  images: string[];
  variants: NewVariant[];
}

export type VariantPatch = Partial<
  Pick<NewVariant, 'label' | 'attributes' | 'price' | 'cost' | 'lowStockThreshold' | 'image' | 'weightGrams'>
>;

/** Changement de prix à tracer avec la modification de la variante */
export interface PriceChangeInput {
  before: number;
  after: number;
  reason: string;
  staffId: string;
}

export interface PriceChangeRecord {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  before: number;
  after: number;
  reason: string;
  by: string | null;
  createdAt: Date;
}

export interface StaffProductFilters {
  search?: string | undefined;
  status?: 'draft' | 'published' | 'archived' | undefined;
  categoryId?: string | undefined;
  page: number;
  limit: number;
}

/** « taken » : la référence ou l'adresse tirée vient d'être prise par une création simultanée. */
export type CreateProductResult = { outcome: 'created'; product: StaffProductRecord } | { outcome: 'taken' };

/** Contrat du catalogue côté équipe. */
export interface StaffCatalogRepository {
  list(filters: StaffProductFilters): Promise<{ items: StaffProductRecord[]; total: number }>;
  findById(id: string): Promise<StaffProductRecord | null>;
  /** Plus grand numéro de référence GA-xxxx déjà attribué (999 si aucun). */
  lastSkuNumber(): Promise<number>;
  /** Adresses déjà prises qui commencent par cette base (pagne-wax, pagne-wax-2…). */
  slugsLike(base: string): Promise<string[]>;
  create(product: NewProduct, staffId: string): Promise<CreateProductResult>;
  update(id: string, fields: Partial<ProductFields> & { images?: string[] | undefined }): Promise<StaffProductRecord>;
  setStatus(id: string, status: 'draft' | 'published' | 'archived'): Promise<StaffProductRecord>;
  addVariant(productId: string, variant: NewVariant, staffId: string): Promise<StaffProductRecord | null>;
  /** Le changement de prix éventuel est écrit dans la même transaction que la variante */
  updateVariant(
    productId: string,
    variantId: string,
    patch: VariantPatch,
    priceChange?: PriceChangeInput,
  ): Promise<StaffProductRecord | null>;
  /** Historique des prix, du plus récent au plus ancien, éventuellement limité à un produit */
  listPriceChanges(filter: {
    productId?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ items: PriceChangeRecord[]; total: number }>;
  /** Catégorie utilisable pour un produit : existe et n'est pas une collection transversale. */
  isAssignableCategory(id: string): Promise<boolean>;
}

const toStaffRecord = (row: Prisma.ProductGetPayload<{ include: typeof productInclude }>): StaffProductRecord => {
  const base = toProductRecord(row);
  return {
    ...base,
    variants: base.variants.map((v, i) => {
      const source = row.variants[i]!;
      return { ...v, cost: source.cost?.toNumber() ?? null, unsellable: source.unsellable };
    }),
    updatedAt: row.updatedAt,
  };
};

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Promotion du domaine vers les quatre colonnes ; null efface la promotion. */
const promotionColumns = (promotion: ProductRecord['promotion']) => ({
  promotionType: promotion?.type ?? null,
  promotionValue: promotion?.value ?? null,
  promotionStartsAt: promotion?.startsAt ?? null,
  promotionEndsAt: promotion?.endsAt ?? null,
});

function fieldColumns(fields: Partial<ProductFields>) {
  const { promotion, ...rest } = fields;
  return { ...rest, ...(promotion !== undefined ? promotionColumns(promotion) : {}) };
}

const variantData = (v: NewVariant, position: number) => ({ ...v, position });

export const staffCatalogRepository: StaffCatalogRepository = {
  async list({ search, status, categoryId, page, limit }) {
    const where: Prisma.ProductWhereInput = {
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);
    return { items: rows.map(toStaffRecord), total };
  },

  async findById(id) {
    const row = await prisma.product.findUnique({ where: { id }, include: productInclude });
    return row ? toStaffRecord(row) : null;
  },

  async lastSkuNumber() {
    const [row] = await prisma.$queryRaw<Array<{ last: number | null }>>`
      SELECT MAX(CAST(SUBSTRING(sku FROM 4) AS INTEGER)) AS last FROM products WHERE sku ~ '^GA-[0-9]+$'`;
    return row?.last ?? 999;
  },

  async slugsLike(base) {
    const rows = await prisma.product.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
    return rows.map((r) => r.slug);
  },

  /** Produit, photos, variantes et mouvements de stock initial dans une seule transaction. */
  async create(product, staffId) {
    const { images, variants, promotion, ...fields } = product;
    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            ...fields,
            ...promotionColumns(promotion),
            images: { create: images.map((url, position) => ({ url, position })) },
            variants: { create: variants.map(variantData) },
          },
          include: productInclude,
        });
        for (const v of created.variants.filter((variant) => variant.stock > 0))
          await tx.stockMovement.create({
            data: {
              variantId: v.id,
              type: 'reception',
              before: 0,
              after: v.stock,
              delta: v.stock,
              reason: 'Stock initial à la création du produit',
              staffId,
            },
            select: { id: true },
          });
        return created;
      });
      return { outcome: 'created', product: toStaffRecord(row) };
    } catch (error) {
      if (isUniqueViolation(error)) return { outcome: 'taken' };
      throw error;
    }
  },

  /** Les photos sont remplacées dans l'ordre reçu : la première devient la vignette. */
  async update(id, { images, ...fields }) {
    const row = await prisma.$transaction(async (tx) => {
      if (images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productImage.createMany({ data: images.map((url, position) => ({ productId: id, url, position })) });
      }
      return tx.product.update({ where: { id }, data: fieldColumns(fields), include: productInclude });
    });
    return toStaffRecord(row);
  },

  async setStatus(id, status) {
    return toStaffRecord(await prisma.product.update({ where: { id }, data: { status }, include: productInclude }));
  },

  async addVariant(productId, variant, staffId) {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const count = await tx.variant.count({ where: { productId } });
        const created = await tx.variant.create({
          data: { ...variantData(variant, count), productId },
          select: { id: true },
        });
        if (variant.stock > 0)
          await tx.stockMovement.create({
            data: {
              variantId: created.id,
              type: 'reception',
              before: 0,
              after: variant.stock,
              delta: variant.stock,
              reason: 'Stock initial à la création de la variante',
              staffId,
            },
            select: { id: true },
          });
        return tx.product.findUniqueOrThrow({ where: { id: productId }, include: productInclude });
      });
      return toStaffRecord(row);
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  async updateVariant(productId, variantId, patch, priceChange) {
    const applied = await prisma.$transaction(async (tx) => {
      const updated = await tx.variant.updateMany({ where: { id: variantId, productId }, data: patch });
      if (updated.count !== 1) return false;
      if (priceChange) await tx.priceChange.create({ data: { variantId, ...priceChange } });
      return true;
    });
    return applied ? staffCatalogRepository.findById(productId) : null;
  },

  async listPriceChanges({ productId, page, limit }) {
    const where = productId ? { variant: { productId } } : {};
    const [rows, total] = await prisma.$transaction([
      prisma.priceChange.findMany({
        where,
        include: {
          staff: { select: { firstName: true, lastName: true } },
          variant: { select: { label: true, product: { select: { id: true, name: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.priceChange.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        productId: r.variant.product.id,
        variantId: r.variantId,
        productName: r.variant.product.name,
        variantLabel: r.variant.label,
        before: r.before,
        after: r.after,
        reason: r.reason,
        by: r.staff ? r.staff.firstName + ' ' + r.staff.lastName : null,
        createdAt: r.createdAt,
      })),
      total,
    };
  },

  async isAssignableCategory(id) {
    return (await prisma.category.count({ where: { id, isCollection: false } })) === 1;
  },
};
