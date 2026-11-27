import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import type { PromoRule } from '../orders/orders.pricing.js';

export interface PromoCodeRecord extends PromoRule {
  label: string;
  createdAt: Date;
}

export type PromoCodeFields = Omit<PromoCodeRecord, 'id' | 'uses' | 'createdAt'>;

export interface PromoCodesRepository {
  findByCode(code: string): Promise<PromoCodeRecord | null>;
  findById(id: string): Promise<PromoCodeRecord | null>;
  publicCodes(at: Date): Promise<PromoCodeRecord[]>;
  list(filters: { search?: string | undefined; page: number; limit: number }): Promise<{ items: PromoCodeRecord[]; total: number }>;
  create(fields: PromoCodeFields): Promise<PromoCodeRecord | null>;
  update(id: string, fields: Partial<PromoCodeFields>): Promise<PromoCodeRecord | null | undefined>;
}

const include = {
  products: { select: { productId: true } },
  categories: { select: { categoryId: true } },
} as const satisfies Prisma.PromoCodeInclude;
type Row = Prisma.PromoCodeGetPayload<{ include: typeof include }>;

const toRecord = (row: Row): PromoCodeRecord => ({
  id: row.id,
  code: row.code,
  label: row.label,
  type: row.type,
  value: row.value.toNumber(),
  minAmount: row.minAmount.toNumber(),
  freeDelivery: row.freeDelivery,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  maxUses: row.maxUses,
  uses: row.uses,
  active: row.active,
  productIds: row.products.map((product) => product.productId),
  categoryIds: row.categories.map((category) => category.categoryId),
  createdAt: row.createdAt,
});

const isError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

const splitFields = ({ productIds, categoryIds, ...fields }: Partial<PromoCodeFields>) => ({
  data: fields,
  products: productIds,
  categories: categoryIds,
});

export const promoCodesRepository: PromoCodesRepository = {
  async findByCode(code) {
    const row = await prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() }, include });
    return row ? toRecord(row) : null;
  },
  async findById(id) {
    const row = await prisma.promoCode.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  },
  async publicCodes(at) {
    const rows = await prisma.promoCode.findMany({
      where: { active: true, startsAt: { lte: at }, endsAt: { gte: at } },
      include,
      orderBy: { endsAt: 'asc' },
    });
    return rows.filter((row) => row.maxUses === null || row.uses < row.maxUses).map(toRecord);
  },
  async list({ search, page, limit }) {
    const where: Prisma.PromoCodeWhereInput = search
      ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { label: { contains: search, mode: 'insensitive' } }] }
      : {};
    const [rows, total] = await prisma.$transaction([
      prisma.promoCode.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      prisma.promoCode.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  },
  async create({ productIds, categoryIds, ...fields }) {
    try {
      const row = await prisma.promoCode.create({
        data: {
          ...fields,
          products: { create: productIds.map((productId) => ({ productId })) },
          categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
        },
        include,
      });
      return toRecord(row);
    } catch (error) {
      if (isError(error, 'P2002')) return null;
      throw error;
    }
  },
  async update(id, fields) {
    const { data, products, categories } = splitFields(fields);
    try {
      const row = await prisma.$transaction(async (tx) => {
        if (products) {
          await tx.promoCodeProduct.deleteMany({ where: { promoCodeId: id } });
          await tx.promoCodeProduct.createMany({ data: products.map((productId) => ({ promoCodeId: id, productId })) });
        }
        if (categories) {
          await tx.promoCodeCategory.deleteMany({ where: { promoCodeId: id } });
          await tx.promoCodeCategory.createMany({ data: categories.map((categoryId) => ({ promoCodeId: id, categoryId })) });
        }
        return tx.promoCode.update({ where: { id }, data, include });
      });
      return toRecord(row);
    } catch (error) {
      if (isError(error, 'P2002')) return null;
      if (isError(error, 'P2025')) return undefined;
      throw error;
    }
  },
};
