import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export interface ShopRecord {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  description: string;
  city: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  acceptedPaymentMethods: Array<'cash' | 'airtel' | 'moov'>;
  deliveryMode: 'okoza' | 'seller';
  status: 'active' | 'suspended';
  suspensionReason: string | null;
  suspendedAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

export type ShopFields = Pick<
  ShopRecord,
  'name' | 'description' | 'city' | 'district' | 'latitude' | 'longitude' | 'phone' | 'acceptedPaymentMethods'
>;
export type NewShop = ShopFields & Pick<ShopRecord, 'ownerId' | 'slug'>;

export interface OwnerRecord {
  id: string;
  email: string;
  firstName: string;
  status: 'active' | 'anonymized';
}

export interface Page<T> {
  items: T[];
  total: number;
}

const shopSelect = {
  id: true,
  ownerId: true,
  slug: true,
  name: true,
  description: true,
  city: true,
  district: true,
  latitude: true,
  longitude: true,
  phone: true,
  acceptedPaymentMethods: true,
  deliveryMode: true,
  status: true,
  suspensionReason: true,
  suspendedAt: true,
  verifiedAt: true,
  createdAt: true,
} as const satisfies Prisma.ShopSelect;

type ShopRow = Prisma.ShopGetPayload<{ select: typeof shopSelect }>;

const toShop = (row: ShopRow): ShopRecord => ({
  ...row,
  latitude: row.latitude?.toNumber() ?? null,
  longitude: row.longitude?.toNumber() ?? null,
});

export interface ShopsRepository {
  findOwner(customerId: string): Promise<OwnerRecord | null>;
  findByOwner(customerId: string): Promise<ShopRecord | null>;
  findById(id: string): Promise<ShopRecord | null>;
  findBySlug(slug: string): Promise<ShopRecord | null>;
  listPublic(query: { page: number; limit: number }): Promise<Page<ShopRecord>>;
  create(shop: NewShop): Promise<ShopRecord | 'owner_taken' | 'slug_taken'>;
  update(id: string, fields: Partial<ShopFields>): Promise<ShopRecord>;
  list(query: { status?: ShopRecord['status']; search?: string; page: number; limit: number }): Promise<Page<ShopRecord>>;
  suspend(id: string, change: { reason: string; staffId: string; at: Date }): Promise<ShopRecord | null>;
  reinstate(id: string): Promise<ShopRecord | null>;
  setVerified(id: string, by: { staffId: string; at: Date } | null): Promise<ShopRecord | null>;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export const shopsRepository: ShopsRepository = {
  findOwner: (customerId) =>
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, email: true, firstName: true, status: true },
    }),

  async findByOwner(customerId) {
    const row = await prisma.shop.findUnique({ where: { ownerId: customerId }, select: shopSelect });
    return row ? toShop(row) : null;
  },

  async findById(id) {
    const row = await prisma.shop.findUnique({ where: { id }, select: shopSelect });
    return row ? toShop(row) : null;
  },

  async findBySlug(slug) {
    const row = await prisma.shop.findUnique({ where: { slug }, select: shopSelect });
    return row ? toShop(row) : null;
  },

  async listPublic({ page, limit }) {
    const where = { status: 'active' as const };
    const [rows, total] = await prisma.$transaction([
      prisma.shop.findMany({
        where,
        select: shopSelect,
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shop.count({ where }),
    ]);
    return { items: rows.map(toShop), total };
  },

  async create(shop) {
    if (await prisma.shop.findUnique({ where: { ownerId: shop.ownerId }, select: { id: true } })) return 'owner_taken';
    if (await prisma.shop.findUnique({ where: { slug: shop.slug }, select: { id: true } })) return 'slug_taken';
    try {
      const row = await prisma.shop.create({ data: shop, select: shopSelect });
      return toShop(row);
    } catch (error) {
      if (isUniqueViolation(error)) return 'slug_taken';
      throw error;
    }
  },

  async update(id, fields) {
    const row = await prisma.shop.update({ where: { id }, data: fields, select: shopSelect });
    return toShop(row);
  },

  async list({ status, search, page, limit }) {
    const where: Prisma.ShopWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
              { owner: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.shop.findMany({
        where,
        select: shopSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shop.count({ where }),
    ]);
    return { items: rows.map(toShop), total };
  },

  async suspend(id, { reason, staffId, at }) {
    const { count } = await prisma.shop.updateMany({
      where: { id, status: 'active' },
      data: { status: 'suspended', suspensionReason: reason, suspendedAt: at, suspendedById: staffId },
    });
    return count ? shopsRepository.findById(id) : null;
  },

  async reinstate(id) {
    const { count } = await prisma.shop.updateMany({
      where: { id, status: 'suspended' },
      data: { status: 'active', suspensionReason: null, suspendedAt: null, suspendedById: null },
    });
    return count ? shopsRepository.findById(id) : null;
  },

  async setVerified(id, by) {
    const { count } = await prisma.shop.updateMany({
      where: { id },
      data: by ? { verifiedAt: by.at, verifiedById: by.staffId } : { verifiedAt: null, verifiedById: null },
    });
    return count ? shopsRepository.findById(id) : null;
  },
};
