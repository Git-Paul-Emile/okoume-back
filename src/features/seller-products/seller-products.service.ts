import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnprocessableError,
} from '../../core/errors/AppError.js';
import type { MediaStorage } from '../../infrastructure/media/mediaStorage.js';
import { paginate } from '../../core/http/apiResponse.js';
import { slugify } from '../../core/text/slugify.js';
import type { JobQueue } from '../../infrastructure/queue/jobQueue.js';
import type { ShopRecord, ShopsRepository } from '../shops/shops.repository.js';
import { toStaffProductDto } from '../staff-catalog/staff-catalog.dto.js';
import type { StaffCatalogRepository, StaffProductRecord } from '../staff-catalog/staff-catalog.repository.js';
import { freeSlug } from '../staff-catalog/staff-catalog.service.js';
import type { StockRepository } from '../staff-stock/staff-stock.repository.js';
import type {
  AddSellerVariantInput,
  CreateSellerProductInput,
  ListSellerProductsQuery,
  SellerStockInput,
  UpdateSellerProductInput,
  UpdateSellerVariantInput,
} from './seller-products.schemas.js';

export interface SellerProductsDeps {
  catalog: StaffCatalogRepository;
  shops: ShopsRepository;
  stock: StockRepository;
  queue: JobQueue;
  /** null : envoi de photos non configuré (aucune clé de stockage) */
  media: MediaStorage | null;
  now: () => Date;
}

const CREATE_ATTEMPTS = 3;

/** Vue du vendeur : son produit, sans le coût d'achat qui ne concerne que la boutique OKOZA. */
export const toSellerProductDto = (p: StaffProductRecord) => {
  const staff = toStaffProductDto(p);
  return {
    id: staff.id,
    slug: staff.slug,
    sku: staff.sku,
    name: staff.name,
    status: staff.status,
    categoryId: staff.categoryId,
    brand: staff.brand,
    shortDescription: staff.shortDescription,
    description: staff.description,
    specs: staff.specs,
    usageTips: staff.usageTips,
    images: staff.images,
    thumbnail: staff.thumbnail,
    condition: staff.condition,
    moderation: staff.moderation,
    moderationIssues: staff.moderationIssues,
    moderationNote: staff.moderationNote,
    variants: staff.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      label: v.label,
      attributes: v.attributes,
      price: v.price,
      stock: v.stock,
      reserved: v.reserved,
      available: v.available,
      image: v.image,
    })),
    createdAt: staff.createdAt,
    updatedAt: staff.updatedAt,
  };
};

/** Référence unique d'un produit de vendeur : VD- et huit caractères tirés au hasard. */
const sellerSku = () => `VD-${randomUUID().slice(0, 8).toUpperCase()}`;
const variantSku = (productSku: string, label: string) => `${productSku}-${slugify(label).toUpperCase() || 'STD'}`;

/**
 * Produits des vendeurs (cahier des charges 1.2, 32.3) : mêmes produits que la boutique OKOZA, rattachés à la
 * boutique du compte connecté. Une boutique ne voit et ne modifie que ses produits (IDOR) ; un produit n'est en
 * vente qu'après une vérification favorable, et toute modification de son contenu repasse cette vérification.
 */
export const createSellerProductsService = ({ catalog, shops, stock, queue, media, now }: SellerProductsDeps) => {
  async function myShop(customerId: string) {
    const shop = await shops.findByOwner(customerId);
    if (!shop) throw new ForbiddenError('Ouvrez d’abord votre boutique pour vendre sur OKOZA.');
    return shop;
  }

  function writable(shop: ShopRecord) {
    if (shop.status === 'suspended')
      throw new ForbiddenError('Votre boutique est suspendue : ses produits ne peuvent pas être modifiés.');
  }

  /** Produit de la boutique ; un produit d'une autre boutique est introuvable, sans dire qu'il existe. */
  async function mine(shop: ShopRecord, id: string) {
    const product = await catalog.findById(id);
    if (!product || product.shopId !== shop.id) throw new NotFoundError('Produit introuvable.');
    return product;
  }

  async function assertCategory(id: string) {
    if (!(await catalog.isAssignableCategory(id))) throw new UnprocessableError('Choisissez une catégorie existante.');
  }

  /** Soumet à la vérification et met la vérification en file ; le produit sort de la vente jusqu'à l'avis. */
  async function submit(product: StaffProductRecord) {
    if (!product.images.length) throw new UnprocessableError('Ajoutez au moins une photo avant de soumettre.');
    if (!product.variants.length) throw new UnprocessableError('Ajoutez au moins une variante avant de soumettre.');
    const version = await catalog.submitForReview(product.id);
    await queue.send('products.review', { productId: product.id, version });
    return (await catalog.findById(product.id))!;
  }

  /** Après une modification : un produit déjà soumis une fois repasse la vérification. */
  const resubmitIfReviewed = async (product: StaffProductRecord) =>
    product.moderation === null ? product : submit(product);

  return {
    async list(customerId: string, query: ListSellerProductsQuery) {
      const shop = await myShop(customerId);
      const { items, total } = await catalog.list({ ...query, shopId: shop.id });
      return paginate(items.map(toSellerProductDto), total, query.page, query.limit);
    },

    /** Envoi signé des photos, directement du navigateur vers le stockage : l'API ne reçoit jamais le fichier. */
    async signPhotoUpload(customerId: string) {
      writable(await myShop(customerId));
      if (!media) throw new ServiceUnavailableError('L’envoi de photos n’est pas encore configuré.');
      const upload = media.signUpload('products', now());
      return { ...upload, expiresAt: upload.expiresAt.toISOString() };
    },

    async get(customerId: string, id: string) {
      return toSellerProductDto(await mine(await myShop(customerId), id));
    },

    async create(customerId: string, input: CreateSellerProductInput) {
      const shop = await myShop(customerId);
      writable(shop);
      await assertCategory(input.categoryId);
      const { optionName, submit: submitNow, variants, ...fields } = input;
      for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
        const sku = sellerSku();
        const base = slugify(input.name) || 'produit';
        const result = await catalog.create(
          {
            ...fields,
            shopId: shop.id,
            moderation: null,
            slug: freeSlug(base, await catalog.slugsLike(base)),
            sku,
            status: 'draft',
            // Prix du vendeur toutes taxes comprises : aucune TVA calculée par OKOZA sur ses ventes
            vatRate: 0,
            hsCode: null,
            featured: false,
            isNew: input.condition === 'new',
            dealOfTheDay: false,
            tags: [],
            promotion: null,
            variants: variants.map((v) => ({
              ...v,
              sku: variantSku(sku, v.label),
              attributes: optionName ? { [optionName]: v.label } : {},
              cost: null,
              lowStockThreshold: 1,
              weightGrams: null,
            })),
          },
          null,
        );
        if (result.outcome === 'created')
          return toSellerProductDto(submitNow ? await submit(result.product) : result.product);
      }
      throw new ConflictError('Création simultanée d’un autre produit : réessayez.');
    },

    async update(customerId: string, id: string, input: UpdateSellerProductInput) {
      const shop = await myShop(customerId);
      writable(shop);
      await mine(shop, id);
      if (input.categoryId) await assertCategory(input.categoryId);
      const fields = { ...input, ...(input.condition ? { isNew: input.condition === 'new' } : {}) };
      return toSellerProductDto(await resubmitIfReviewed(await catalog.update(id, fields)));
    },

    /** Soumission à la vérification, pour un brouillon ou après une demande de correction. */
    async submit(customerId: string, id: string) {
      const shop = await myShop(customerId);
      writable(shop);
      const product = await mine(shop, id);
      if (product.moderation === 'in_review' || product.moderation === 'pending_moderation')
        throw new ConflictError('Ce produit est déjà en cours de vérification.');
      if (product.moderation === 'rejected')
        throw new ConflictError('Ce produit a été refusé par l’équipe : il ne peut pas être soumis à nouveau.');
      return toSellerProductDto(await submit(product));
    },

    /** Retrait de la vente : le produit est archivé, ses commandes passées restent consultables. */
    async withdraw(customerId: string, id: string) {
      const shop = await myShop(customerId);
      await mine(shop, id);
      return toSellerProductDto(await catalog.setStatus(id, 'archived'));
    },

    async addVariant(customerId: string, id: string, input: AddSellerVariantInput) {
      const shop = await myShop(customerId);
      writable(shop);
      const product = await mine(shop, id);
      if (product.variants.some((v) => v.label.toLowerCase() === input.label.toLowerCase()))
        throw new ConflictError('Une variante porte déjà cette valeur.');
      const option = product.variants.map((v) => Object.keys(v.attributes)[0]).find((k) => k !== undefined);
      const updated = await catalog.addVariant(
        id,
        {
          ...input,
          sku: variantSku(product.sku, input.label),
          attributes: option ? { [option]: input.label } : {},
          cost: null,
          lowStockThreshold: 1,
          weightGrams: null,
        },
        null,
      );
      if (!updated) throw new ConflictError('Une variante porte déjà cette référence.');
      return toSellerProductDto(await resubmitIfReviewed(updated));
    },

    /** Un changement de prix est tracé dans l'historique des prix et repasse la vérification. */
    async updateVariant(customerId: string, id: string, variantId: string, input: UpdateSellerVariantInput) {
      const shop = await myShop(customerId);
      writable(shop);
      const product = await mine(shop, id);
      const variant = product.variants.find((v) => v.id === variantId);
      if (!variant) throw new NotFoundError('Variante introuvable.');
      if (
        input.label &&
        product.variants.some((v) => v.id !== variantId && v.label.toLowerCase() === input.label!.toLowerCase())
      )
        throw new ConflictError('Une variante porte déjà cette valeur.');
      const option = Object.keys(variant.attributes)[0];
      const priceChanged = input.price !== undefined && input.price !== variant.price;
      const updated = await catalog.updateVariant(
        id,
        variantId,
        {
          ...input,
          ...(input.label && option ? { attributes: { ...variant.attributes, [option]: input.label } } : {}),
        },
        priceChanged
          ? { before: variant.price, after: input.price!, reason: 'Prix modifié par le vendeur', staffId: null }
          : undefined,
      );
      if (!updated) throw new NotFoundError('Variante introuvable.');
      return toSellerProductDto(await resubmitIfReviewed(updated));
    },

    /** Stock compté par le vendeur ; jamais sous les quantités réservées par des commandes en cours. */
    async setStock(customerId: string, id: string, variantId: string, input: SellerStockInput) {
      const shop = await myShop(customerId);
      writable(shop);
      const product = await mine(shop, id);
      if (!product.variants.some((v) => v.id === variantId)) throw new NotFoundError('Variante introuvable.');
      const result = await stock.adjust(variantId, { type: 'ajustement', counted: input.counted }, input.reason, null);
      if (result.outcome === 'not_found') throw new NotFoundError('Variante introuvable.');
      if (result.outcome === 'below_reserved')
        throw new ConflictError(
          `Impossible : ${result.reserved} article${result.reserved > 1 ? 's sont réservés' : ' est réservé'} par des commandes en cours.`,
        );
      return toSellerProductDto((await catalog.findById(id))!);
    },
  };
};

export type SellerProductsService = ReturnType<typeof createSellerProductsService>;
