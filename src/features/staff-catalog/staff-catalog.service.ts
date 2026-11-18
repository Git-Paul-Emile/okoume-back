import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee, type Permission } from '../../core/security/permissions.js';
import { slugify } from '../../core/text/slugify.js';
import { toStaffProductDto } from './staff-catalog.dto.js';
import type { NewVariant, StaffCatalogRepository, StaffVariantRecord } from './staff-catalog.repository.js';
import type {
  AddVariantInput,
  CreateProductInput,
  ListStaffProductsQuery,
  PriceChangesQuery,
  UpdateProductInput,
  UpdateVariantInput,
} from './staff-catalog.schemas.js';

export type CatalogActor = Grantee & { id: string };

const CREATE_ATTEMPTS = 3;

/** Première adresse libre : base, base-2, base-3… */
export function freeSlug(base: string, taken: readonly string[]) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

const variantSku = (productSku: string, label: string) => `${productSku}-${slugify(label).toUpperCase() || 'STD'}`;

/**
 * Un produit sans coût d'achat valide ne peut être ni publié ni vendu (cahier des charges, 28.1).
 * Renvoie la raison du refus, ou null si le produit peut être publié.
 */
export function publicationBlocker(p: {
  images: readonly string[];
  variants: ReadonlyArray<{ label: string; cost: number | null }>;
}): string | null {
  if (!p.images.length) return 'Ajoutez au moins une image avant de publier.';
  if (!p.variants.length) return 'Ajoutez au moins une variante avant de publier.';
  const missing = p.variants.find((v) => v.cost === null);
  if (missing) return `Variante « ${missing.label} » : le coût d’achat est obligatoire pour publier.`;
  return null;
}

export const createStaffCatalogService = (catalog: StaffCatalogRepository) => {
  function require(actor: Grantee, permission: Permission) {
    if (!can(actor, permission)) throw new ForbiddenError();
  }

  async function load(id: string) {
    const product = await catalog.findById(id);
    if (!product) throw new NotFoundError('Produit introuvable.');
    return product;
  }

  async function assertCategory(id: string) {
    if (!(await catalog.isAssignableCategory(id)))
      throw new UnprocessableError('Choisissez une catégorie existante (pas une collection).');
  }

  /** L'option qui distingue les variantes d'un produit (Taille, Couleur…), lue sur ses variantes. */
  const optionOf = (variants: readonly StaffVariantRecord[]) =>
    variants.map((v) => Object.keys(v.attributes)[0]).find((key) => key !== undefined) ?? null;

  return {
    async list(query: ListStaffProductsQuery, actor: Grantee) {
      // Contrôle aussi dans le service : la route n'est pas le seul appelant possible (security.md)
      require(actor, 'catalogue:consulter');
      const { items, total } = await catalog.list(query);
      return paginate(items.map(toStaffProductDto), total, query.page, query.limit);
    },

    get: async (id: string) => toStaffProductDto(await load(id)),

    /** Historique des prix (4.3), tous produits ou un seul */
    async priceChanges(query: PriceChangesQuery, actor: Grantee) {
      require(actor, 'catalogue:consulter');
      const { items, total } = await catalog.listPriceChanges(query);
      return paginate(
        items.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
        total,
        query.page,
        query.limit,
      );
    },

    /**
     * Création : référence GA-xxxx suivante et adresse unique attribuées ici. Une création simultanée qui
     * prend la même référence fait recommencer le tirage, sans doublon grâce aux contraintes d'unicité.
     */
    async create(input: CreateProductInput, actor: CatalogActor) {
      require(actor, 'catalogue:creer');
      if (input.publish) require(actor, 'catalogue:publier');
      await assertCategory(input.categoryId);
      const { optionName, publish, variants, ...fields } = input;
      const draftVariants = variants.map((v) => ({ ...v, attributes: optionName ? { [optionName]: v.label } : {} }));
      if (publish) {
        const blocker = publicationBlocker({ images: input.images, variants: draftVariants });
        if (blocker) throw new UnprocessableError(`${blocker} Enregistrez en brouillon sinon.`);
      }

      for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
        const sku = `GA-${(await catalog.lastSkuNumber()) + 1}`;
        const base = slugify(input.name) || 'produit';
        const slug = freeSlug(base, await catalog.slugsLike(base));
        const result = await catalog.create(
          {
            ...fields,
            slug,
            sku,
            status: publish ? 'published' : 'draft',
            variants: draftVariants.map((v): NewVariant => ({ ...v, sku: variantSku(sku, v.label) })),
          },
          actor.id,
        );
        if (result.outcome === 'created') return toStaffProductDto(result.product);
      }
      throw new ConflictError('Création simultanée d’un autre produit : réessayez.');
    },

    async update(id: string, input: UpdateProductInput, actor: CatalogActor) {
      require(actor, 'catalogue:modifier');
      await load(id);
      if (input.categoryId) await assertCategory(input.categoryId);
      return toStaffProductDto(await catalog.update(id, input));
    },

    /** Publier, repasser en brouillon ou archiver : droit catalogue:publier ; la publication vérifie le produit. */
    async setStatus(id: string, status: 'draft' | 'published' | 'archived', actor: CatalogActor) {
      require(actor, 'catalogue:publier');
      const product = await load(id);
      if (status === 'published') {
        const blocker = publicationBlocker(product);
        if (blocker) throw new UnprocessableError(blocker);
        await assertCategory(product.categoryId);
      }
      return toStaffProductDto(await catalog.setStatus(id, status));
    },

    async addVariant(id: string, input: AddVariantInput, actor: CatalogActor) {
      require(actor, 'catalogue:modifier');
      const product = await load(id);
      if (product.variants.some((v) => v.label.toLowerCase() === input.label.toLowerCase()))
        throw new ConflictError('Une variante porte déjà cette valeur.');
      if (product.status === 'published' && input.cost === null)
        throw new UnprocessableError('Produit en vente : le coût d’achat de la nouvelle variante est obligatoire.');
      const option = optionOf(product.variants);
      const updated = await catalog.addVariant(
        id,
        { ...input, attributes: option ? { [option]: input.label } : {}, sku: variantSku(product.sku, input.label) },
        actor.id,
      );
      if (!updated) throw new ConflictError('Une variante porte déjà cette référence.');
      return toStaffProductDto(updated);
    },

    /** Le prix et le coût sont contrôlés ensemble, avec les valeurs actuelles pour ce qui n'est pas envoyé. */
    async updateVariant(id: string, variantId: string, input: UpdateVariantInput, actor: CatalogActor) {
      require(actor, 'catalogue:modifier');
      const product = await load(id);
      const variant = product.variants.find((v) => v.id === variantId);
      if (!variant) throw new NotFoundError('Variante introuvable.');
      const price = input.price ?? variant.price;
      const cost = input.cost === undefined ? variant.cost : input.cost;
      if (cost !== null && cost >= price) throw new UnprocessableError('Le coût d’achat dépasse le prix de vente.');
      if (product.status === 'published' && cost === null)
        throw new UnprocessableError('Produit en vente : le coût d’achat ne peut pas être retiré.');
      if (
        input.label &&
        product.variants.some((v) => v.id !== variantId && v.label.toLowerCase() === input.label!.toLowerCase())
      )
        throw new ConflictError('Une variante porte déjà cette valeur.');
      const priceChanged = input.price !== undefined && input.price !== variant.price;
      if (priceChanged && !input.priceReason) throw new UnprocessableError('Indiquez le motif du changement de prix.');
      const { priceReason, ...fields } = input;
      const option = optionOf(product.variants);
      const patch = {
        ...fields,
        ...(input.label && option ? { attributes: { ...variant.attributes, [option]: input.label } } : {}),
      };
      const updated = await catalog.updateVariant(
        id,
        variantId,
        patch,
        priceChanged && priceReason
          ? { before: variant.price, after: price, reason: priceReason, staffId: actor.id }
          : undefined,
      );
      if (!updated) throw new NotFoundError('Variante introuvable.');
      return toStaffProductDto(updated);
    },
  };
};

export type StaffCatalogService = ReturnType<typeof createStaffCatalogService>;
