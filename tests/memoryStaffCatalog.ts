import { randomUUID } from 'node:crypto';
import type { CategoryRecord } from '../src/features/categories/categories.repository.js';
import type { DeliveryZoneRecord } from '../src/features/delivery-zones/delivery-zones.repository.js';
import type { ProductRecord } from '../src/features/products/products.repository.js';
import type {
  ProductModeration,
  PriceChangeRecord,
  StaffCatalogRepository,
  StaffProductRecord,
} from '../src/features/staff-catalog/staff-catalog.repository.js';
import type { StaffCategoriesRepository } from '../src/features/staff-categories/staff-categories.repository.js';
import type {
  StaffZoneRecord,
  StaffZonesRepository,
} from '../src/features/staff-delivery-zones/staff-delivery-zones.repository.js';

/**
 * Dépôts de l'équipe en mémoire, sur les mêmes tableaux que le catalogue de test : ce que l'équipe crée
 * est aussitôt visible du catalogue public. Les données internes (coût, stock non revendable, coût de
 * course) sont gardées à côté, comme des colonnes que la vue publique ne lit pas.
 */
export function createMemoryStaffCatalog(store: {
  categories: CategoryRecord[];
  products: ProductRecord[];
  zones: DeliveryZoneRecord[];
  now: () => Date;
}) {
  const costs = new Map<string, number | null>();
  const priceChanges: PriceChangeRecord[] = [];
  const updatedAt = new Map<string, Date>();
  const zoneExtras = new Map<string, { courierCost: number | null; position: number }>();
  // Colonnes propres aux produits des vendeurs (32.3), que le catalogue public ne lit pas
  const review = new Map<
    string,
    {
      shopId: string | null;
      moderation: ProductModeration | null;
      issues: string[];
      note: string | null;
      version: number;
    }
  >();
  const reviewOf = (id: string) =>
    review.get(id) ?? { shopId: null, moderation: null, issues: [], note: null, version: 0 };

  const toStaff = (p: ProductRecord): StaffProductRecord => ({
    ...p,
    variants: p.variants.map((v) => ({ ...v, cost: costs.get(v.id) ?? null, unsellable: 0 })),
    shopId: reviewOf(p.id).shopId,
    moderation: reviewOf(p.id).moderation,
    moderationIssues: reviewOf(p.id).issues,
    moderationNote: reviewOf(p.id).note,
    moderationVersion: reviewOf(p.id).version,
    updatedAt: updatedAt.get(p.id) ?? p.createdAt,
  });
  const product = (id: string) => store.products.find((p) => p.id === id);
  const touch = (id: string) => updatedAt.set(id, store.now());

  const catalog: StaffCatalogRepository = {
    async list({ search, status, categoryId, shopId, moderation, page, limit }) {
      const matching = store.products.filter(
        (p) =>
          (!status || p.status === status) &&
          (!shopId || reviewOf(p.id).shopId === (shopId === 'okoume' ? null : shopId)) &&
          (!moderation || reviewOf(p.id).moderation === moderation) &&
          (!categoryId || p.categoryId === categoryId) &&
          (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search)),
      );
      return { items: matching.slice((page - 1) * limit, page * limit).map(toStaff), total: matching.length };
    },
    findById: async (id) => {
      const found = product(id);
      return found ? toStaff(found) : null;
    },
    lastSkuNumber: async () =>
      Math.max(999, ...store.products.map((p) => (/^GA-\d+$/.test(p.sku) ? Number(p.sku.slice(3)) : 0))),
    slugsLike: async (base) => store.products.filter((p) => p.slug.startsWith(base)).map((p) => p.slug),
    async create(input) {
      if (store.products.some((p) => p.sku === input.sku || p.slug === input.slug)) return { outcome: 'taken' };
      const { variants, shopId = null, moderation = null, condition = null, ...fields } = input;
      const record: ProductRecord = {
        ...fields,
        id: randomUUID(),
        createdAt: store.now(),
        seller: shopId ? { id: shopId, slug: 'boutique', name: 'Boutique' } : null,
        condition,
        variants: variants.map(({ cost, weightGrams: _w, ...v }) => {
          const id = randomUUID();
          costs.set(id, cost);
          return { ...v, id, reserved: 0 };
        }),
      };
      store.products.push(record);
      review.set(record.id, { shopId, moderation, issues: [], note: null, version: 0 });
      return { outcome: 'created', product: toStaff(record) };
    },
    async update(id, { images, ...fields }) {
      const found = product(id)!;
      Object.assign(found, fields, images ? { images } : {});
      touch(id);
      return toStaff(found);
    },
    async setStatus(id, status) {
      const found = product(id)!;
      found.status = status;
      touch(id);
      return toStaff(found);
    },
    async addVariant(productId, { cost, weightGrams: _w, ...variant }) {
      const found = product(productId);
      if (!found || store.products.some((p) => p.variants.some((v) => v.sku === variant.sku))) return null;
      const id = randomUUID();
      costs.set(id, cost);
      found.variants.push({ ...variant, id, reserved: 0 });
      return toStaff(found);
    },
    async updateVariant(productId, variantId, { cost, weightGrams: _w, ...patch }, priceChange) {
      const owner = product(productId);
      const variant = owner?.variants.find((v) => v.id === variantId);
      if (!owner || !variant) return null;
      if (priceChange)
        priceChanges.unshift({
          id: randomUUID(),
          productId,
          variantId,
          productName: owner.name,
          variantLabel: variant.label,
          before: priceChange.before,
          after: priceChange.after,
          reason: priceChange.reason,
          by: 'Membre ' + priceChange.staffId,
          createdAt: new Date(),
        });
      Object.assign(variant, patch);
      if (cost !== undefined) costs.set(variantId, cost);
      return toStaff(product(productId)!);
    },
    async submitForReview(id) {
      const current = reviewOf(id);
      const version = current.version + 1;
      review.set(id, { ...current, moderation: 'in_review', issues: [], note: null, version });
      product(id)!.status = 'draft';
      return version;
    },
    async applyModeration(id, expected, patch) {
      const current = reviewOf(id);
      if (current.version !== expected.version || !current.moderation || !expected.states.includes(current.moderation))
        return false;
      review.set(id, { ...current, moderation: patch.moderation, issues: patch.issues, note: patch.note });
      product(id)!.status = patch.status;
      return true;
    },
    isAssignableCategory: async (id) => store.categories.some((c) => c.id === id && !c.isCollection),
    async listPriceChanges({ productId, page, limit }) {
      const mine = priceChanges.filter((c) => !productId || c.productId === productId);
      return { items: mine.slice((page - 1) * limit, page * limit), total: mine.length };
    },
  };

  const categories: StaffCategoriesRepository = {
    findAll: async () => store.categories,
    async create(fields) {
      if (store.categories.some((c) => c.slug === fields.slug)) return null;
      const record = { ...fields, id: randomUUID() };
      store.categories.push(record);
      return record;
    },
    async update(id, fields) {
      if (fields.slug && store.categories.some((c) => c.id !== id && c.slug === fields.slug)) return null;
      const found = store.categories.find((c) => c.id === id);
      return found ? Object.assign(found, fields) : null;
    },
    usage: async (id) => ({
      products: store.products.filter((p) => p.categoryId === id).length,
      children: store.categories.filter((c) => c.parentId === id).length,
    }),
    async delete(id) {
      store.categories.splice(
        store.categories.findIndex((c) => c.id === id),
        1,
      );
    },
  };

  const toZone = (z: DeliveryZoneRecord): StaffZoneRecord => ({
    ...z,
    ...(zoneExtras.get(z.id) ?? { courierCost: null, position: 0 }),
  });
  const zones: StaffZonesRepository = {
    findAll: async () => store.zones.map(toZone),
    async create({ courierCost, position, ...fields }) {
      if (store.zones.some((z) => z.city === fields.city && z.name === fields.name)) return null;
      const record = { ...fields, id: randomUUID() };
      store.zones.push(record);
      zoneExtras.set(record.id, { courierCost, position });
      return toZone(record);
    },
    async update(id, { courierCost, position, ...fields }) {
      const found = store.zones.find((z) => z.id === id);
      if (!found) return undefined;
      const next = { ...found, ...fields };
      if (store.zones.some((z) => z.id !== id && z.city === next.city && z.name === next.name)) return null;
      Object.assign(found, fields);
      const extras = zoneExtras.get(id) ?? { courierCost: null, position: 0 };
      zoneExtras.set(id, {
        courierCost: courierCost === undefined ? extras.courierCost : courierCost,
        position: position ?? extras.position,
      });
      return toZone(found);
    },
  };

  return { catalog, categories, zones, costs };
}
