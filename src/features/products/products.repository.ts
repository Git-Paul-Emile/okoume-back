import { escapeLike } from '../../core/text/escapeLike.js';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export interface VariantRecord {
  id: string;
  sku: string;
  label: string;
  attributes: Record<string, string>;
  price: number;
  stock: number;
  reserved: number;
  lowStockThreshold: number;
  image: string | null;
}

export interface ProductRecord {
  id: string;
  slug: string;
  name: string;
  sku: string;
  categoryId: string;
  brand: string | null;
  shortDescription: string;
  description: string[];
  specs: Array<{ label: string; value: string }>;
  usageTips: string | null;
  vatRate: number;
  hsCode: string | null;
  status: 'draft' | 'published' | 'archived';
  featured: boolean;
  dealOfTheDay: boolean;
  isNew: boolean;
  tags: string[];
  promotion: { type: 'percent' | 'fixed'; value: number; startsAt: Date; endsAt: Date } | null;
  images: string[];
  variants: VariantRecord[];
  /** Boutique du vendeur (32.1) ; null pour la boutique Okoumé */
  seller: { id: string; slug: string; name: string } | null;
  /** État annoncé par le vendeur ; null pour la boutique Okoumé (produits neufs) */
  condition: 'new' | 'like_new' | 'good' | 'used' | null;
  createdAt: Date;
}

export type ProductSort = 'relevance' | 'price' | '-price' | '-createdAt' | '-discount';

export interface ProductSearch {
  search?: string | undefined;
  categorySlug?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  inStock: boolean;
  onSale: boolean;
  /** Valeurs acceptées par attribut : { Taille: ['M', 'L'] }. ET entre attributs, OU entre valeurs. */
  attributes: Record<string, string[]>;
  sort: ProductSort;
  /** Boutique : adresse d'un vendeur, ou « okoume » pour la boutique Okoumé seule */
  shop?: string | undefined;
  page: number;
  limit: number;
}

/** Ce qu'il faut savoir d'une variante pour la vendre : prix, promotion et TVA lus en base, jamais reçus du client. */
export interface SellableVariant {
  variantId: string;
  productId: string;
  productName: string;
  categoryId: string;
  published: boolean;
  label: string;
  price: number;
  image: string;
  vatRate: number;
  promotion: ProductRecord['promotion'];
  /** Boutique du vendeur qui reçoit la commande (32.4) ; null pour la boutique Okoumé */
  shopId: string | null;
}

/** Contrat de lecture du catalogue public. */
export interface ProductsRepository {
  search(criteria: ProductSearch, now: Date): Promise<{ ids: string[]; total: number }>;
  findByIds(ids: string[]): Promise<ProductRecord[]>;
  findPublishedBySlug(slug: string, now: Date): Promise<ProductRecord | null>;
  findSellableVariants(variantIds: string[], now: Date): Promise<SellableVariant[]>;
}

export const productInclude = {
  images: { orderBy: { position: 'asc' }, select: { url: true } },
  variants: { orderBy: { position: 'asc' } },
  shop: { select: { id: true, slug: true, name: true } },
} as const satisfies Prisma.ProductInclude;

/**
 * Produit visible : boutique Okoumé, ou boutique de vendeur active dont l'accès court encore (délai de grâce
 * compris, 32.2). En SQL pour la recherche, en filtre Prisma pour les lectures unitaires.
 */
const visibleShopSql = (now: Date) => Prisma.sql`(p.shop_id IS NULL OR EXISTS (
    SELECT 1 FROM shops s JOIN access_plans ap ON ap.id = s.plan_id
    WHERE s.id = p.shop_id AND s.status = 'active'
      AND (ap.kind = 'free' OR s.access_ends_at > ${now}::timestamp
        - make_interval(days => (SELECT grace_days FROM marketplace_settings WHERE id = 1)))))`;

async function visibleShopWhere(now: Date): Promise<Prisma.ProductWhereInput> {
  const settings = await prisma.marketplaceSettings.findUnique({ where: { id: 1 }, select: { graceDays: true } });
  const cutoff = new Date(now.getTime() - (settings?.graceDays ?? 0) * 86_400_000);
  return {
    OR: [
      { shopId: null },
      { shop: { status: 'active', OR: [{ plan: { kind: 'free' } }, { accessEndsAt: { gt: cutoff } }] } },
    ],
  };
}

export type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

const isStringRecord = (value: unknown): value is Record<string, string> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => typeof v === 'string');

const isSpecList = (value: unknown): value is Array<{ label: string; value: string }> =>
  Array.isArray(value) &&
  value.every((s) => s && typeof s === 'object' && typeof s.label === 'string' && typeof s.value === 'string');

/** Traduit une ligne Prisma (Decimal, JSON) en enregistrement du domaine (nombres, objets typés). */
export function toProductRecord(row: ProductRow): ProductRecord {
  const promotion =
    row.promotionType && row.promotionValue && row.promotionStartsAt && row.promotionEndsAt
      ? {
          type: row.promotionType,
          value: row.promotionValue.toNumber(),
          startsAt: row.promotionStartsAt,
          endsAt: row.promotionEndsAt,
        }
      : null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    sku: row.sku,
    categoryId: row.categoryId,
    brand: row.brand,
    shortDescription: row.shortDescription,
    description: row.description,
    specs: isSpecList(row.specs) ? row.specs : [],
    usageTips: row.usageTips,
    vatRate: row.vatRate.toNumber(),
    hsCode: row.hsCode,
    status: row.status,
    featured: row.featured,
    dealOfTheDay: row.dealOfTheDay,
    isNew: row.isNew,
    tags: row.tags,
    promotion,
    images: row.images.map((i) => i.url),
    seller: row.shop ? { id: row.shop.id, slug: row.shop.slug, name: row.shop.name } : null,
    condition: row.condition,
    variants: row.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      label: v.label,
      attributes: isStringRecord(v.attributes) ? v.attributes : {},
      price: v.price.toNumber(),
      stock: v.stock,
      reserved: v.reserved,
      lowStockThreshold: v.lowStockThreshold,
      image: v.image,
    })),
    createdAt: row.createdAt,
  };
}

const likePattern = (text: string) => `%${escapeLike(text)}%`;

/**
 * Recherche du catalogue en SQL paramétré : le filtre et le tri par prix portent sur le prix après
 * promotion, qui dépend de la date, ce que l'API de requête de Prisma ne sait pas exprimer.
 * Aucune valeur n'est concaténée : tout passe par des paramètres (Prisma.sql).
 */
function searchQuery(c: ProductSearch, now: Date) {
  const active = Prisma.sql`(p.promotion_type IS NOT NULL AND p.promotion_starts_at <= ${now} AND ${now} <= p.promotion_ends_at)`;
  const effective = Prisma.sql`CASE WHEN ${active} THEN
      CASE WHEN p.promotion_type = 'percent' THEN GREATEST(0, ROUND(v.price * (1 - p.promotion_value / 100)))
           ELSE GREATEST(0, v.price - p.promotion_value) END
    ELSE v.price END`;

  const where: Prisma.Sql[] = [Prisma.sql`p.status = 'published'`, visibleShopSql(now)];
  if (c.shop === 'okoume') where.push(Prisma.sql`p.shop_id IS NULL`);
  else if (c.shop) where.push(Prisma.sql`p.shop_id = (SELECT id FROM shops WHERE slug = ${c.shop})`);
  if (c.categorySlug) where.push(Prisma.sql`p.category_id IN (SELECT id FROM tree)`);
  if (c.search) {
    const pattern = likePattern(c.search);
    where.push(
      Prisma.sql`(p.name ILIKE ${pattern} OR p.brand ILIKE ${pattern} OR p.short_description ILIKE ${pattern} OR ${c.search.toLowerCase()} = ANY(p.tags))`,
    );
  }
  if (c.onSale) where.push(active);
  for (const [key, values] of Object.entries(c.attributes))
    where.push(
      Prisma.sql`EXISTS (SELECT 1 FROM variants va WHERE va.product_id = p.id AND va.attributes ->> ${key} = ANY(${values}))`,
    );

  const having: Prisma.Sql[] = [];
  if (c.minPrice !== undefined) having.push(Prisma.sql`MIN(${effective}) >= ${c.minPrice}`);
  if (c.maxPrice !== undefined) having.push(Prisma.sql`MIN(${effective}) <= ${c.maxPrice}`);
  if (c.inStock) having.push(Prisma.sql`BOOL_OR(v.stock - v.reserved > 0)`);

  const discount = Prisma.sql`CASE WHEN ${active} THEN
      CASE WHEN p.promotion_type = 'percent' THEN p.promotion_value
           ELSE p.promotion_value * 100 / NULLIF(MIN(v.price), 0) END
    ELSE 0 END`;
  const startsWith = c.search ? Prisma.sql`p.name ILIKE ${`${escapeLike(c.search)}%`}` : Prisma.sql`FALSE`;

  // Une catégorie inclut ses sous-catégories ; une collection inclut ses catégories membres et leurs sous-catégories
  const tree = c.categorySlug
    ? Prisma.sql`RECURSIVE root AS (SELECT id FROM categories WHERE slug = ${c.categorySlug}),
        seeds AS (SELECT id FROM root UNION SELECT cm.category_id FROM collection_members cm JOIN root ON cm.collection_id = root.id),
        tree AS (SELECT id FROM seeds UNION SELECT ch.id FROM categories ch JOIN tree ON ch.parent_id = tree.id),`
    : Prisma.empty;

  // Produits retenus, avec les clés de tri calculées une fois
  const matched = Prisma.sql`WITH ${tree} matched AS (
    SELECT p.id, p.created_at, p.featured, ${startsWith} AS starts_with,
           MIN(${effective}) AS min_price, ${discount} AS discount
    FROM products p JOIN variants v ON v.product_id = p.id
    WHERE ${Prisma.join(where, ' AND ')}
    GROUP BY p.id
    ${having.length ? Prisma.sql`HAVING ${Prisma.join(having, ' AND ')}` : Prisma.empty})`;

  const order = {
    relevance: c.search ? Prisma.sql`starts_with DESC, created_at DESC` : Prisma.sql`featured DESC, created_at DESC`,
    price: Prisma.sql`min_price ASC`,
    '-price': Prisma.sql`min_price DESC`,
    '-createdAt': Prisma.sql`created_at DESC`,
    '-discount': Prisma.sql`discount DESC, created_at DESC`,
  }[c.sort];

  return {
    page: Prisma.sql`${matched} SELECT id FROM matched ORDER BY ${order}, id LIMIT ${c.limit} OFFSET ${(c.page - 1) * c.limit}`,
    count: Prisma.sql`${matched} SELECT COUNT(*) AS total FROM matched`,
  };
}

export const productsRepository: ProductsRepository = {
  async search(criteria, now) {
    const query = searchQuery(criteria, now);
    const [rows, counted] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string }>>(query.page),
      prisma.$queryRaw<Array<{ total: bigint }>>(query.count),
    ]);
    return { ids: rows.map((r) => r.id), total: Number(counted[0]?.total ?? 0) };
  },

  async findByIds(ids) {
    if (!ids.length) return [];
    const rows = await prisma.product.findMany({ where: { id: { in: ids } }, include: productInclude });
    const byId = new Map(rows.map((r) => [r.id, toProductRecord(r)] as const));
    // L'ordre de la recherche est conservé
    return ids.flatMap((id) => byId.get(id) ?? []);
  },

  async findPublishedBySlug(slug, now) {
    const row = await prisma.product.findFirst({
      where: { slug, status: 'published', ...(await visibleShopWhere(now)) },
      include: productInclude,
    });
    return row ? toProductRecord(row) : null;
  },

  async findSellableVariants(variantIds, now) {
    if (!variantIds.length) return [];
    const [rows, visible] = await Promise.all([
      prisma.variant.findMany({
        where: { id: { in: variantIds } },
        include: { product: { include: { images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } } } } },
      }),
      // Un produit d'une boutique suspendue ou sans accès ne se vend plus, même s'il est encore publié
      visibleShopWhere(now).then((where) =>
        prisma.variant.findMany({ where: { id: { in: variantIds }, product: where }, select: { id: true } }),
      ),
    ]);
    const sellable = new Set(visible.map((v) => v.id));
    return rows.map((v) => {
      const { promotion, vatRate } = toProductRecord({ ...v.product, images: [], variants: [], shop: null });
      return {
        variantId: v.id,
        productId: v.productId,
        productName: v.product.name,
        categoryId: v.product.categoryId,
        published: v.product.status === 'published' && sellable.has(v.id),
        shopId: v.product.shopId,
        label: v.label,
        price: v.price.toNumber(),
        image: v.image ?? v.product.images[0]?.url ?? '',
        vatRate,
        promotion,
      };
    });
  },
};
