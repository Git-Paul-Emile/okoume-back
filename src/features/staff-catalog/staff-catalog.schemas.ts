import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

const MAX_AMOUNT = 100_000_000;
const MAX_UNITS = 100_000;

const amount = z.int('Montant entier en FCFA.').min(1).max(MAX_AMOUNT);
/** Adresse d'image : HTTPS uniquement (stockage de fichiers ou CDN). */
const imageUrl = z.url({ protocol: /^https$/, message: 'Adresse d’image HTTPS attendue.' }).max(500);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const spec = z.strictObject({ label: text(1, 60), value: text(1, 200) });

/**
 * Promotion du produit (cahier des charges, 4.4) : pourcentage jusqu'à 90 % ou remise fixe, sur une période.
 * null retire la promotion.
 */
const promotion = z
  .strictObject({
    type: z.enum(['percent', 'fixed']),
    value: amount,
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((p) => p.startsAt < p.endsAt, { message: 'La fin doit suivre le début.', path: ['endsAt'] })
  .refine((p) => p.type !== 'percent' || p.value <= 90, { message: '90 % au plus.', path: ['value'] })
  .nullable();

const variantInput = z
  .strictObject({
    label: text(1, 60),
    price: amount,
    cost: amount.nullable().default(null),
    stock: z.int().min(0).max(MAX_UNITS).default(0),
    lowStockThreshold: z.int().min(0).max(1_000).default(3),
    image: imageUrl.nullable().default(null),
    weightGrams: z.int().min(1).max(1_000_000).nullable().default(null),
  })
  .refine((v) => v.cost === null || v.cost < v.price, {
    message: 'Le coût d’achat dépasse le prix de vente.',
    path: ['cost'],
  });

const productFields = {
  name: text(3, 120),
  categoryId: z.uuid('Catégorie invalide.'),
  brand: text(1, 60).nullable().default(null),
  shortDescription: text(10, 300),
  description: z.array(text(1, 3_000)).max(20).default([]),
  specs: z.array(spec).max(40).default([]),
  usageTips: text(1, 2_000).nullable().default(null),
  vatRate: z.number().min(0).max(100).default(18),
  hsCode: text(2, 20).nullable().default(null),
  featured: z.boolean().default(false),
  isNew: z.boolean().default(true),
  dealOfTheDay: z.boolean().default(false),
  tags: z.array(text(1, 40)).max(20).default([]),
  promotion: promotion.default(null),
};

/**
 * Création d'un produit (formulaire « Nouveau produit ») : référence et adresse sont attribuées par l'API.
 * Plusieurs variantes demandent le nom de l'option qui les distingue (Taille, Couleur…).
 */
export const createProductBody = z
  .strictObject({
    ...productFields,
    images: z.array(imageUrl).min(1, 'Ajoutez au moins une image.').max(12),
    optionName: text(1, 40).nullable().default(null),
    variants: z.array(variantInput).min(1).max(50),
    publish: z.boolean().default(false),
  })
  .refine((p) => p.variants.length === 1 || p.optionName !== null, {
    message: 'Indiquez ce qui distingue les variantes (Taille, Couleur…).',
    path: ['optionName'],
  })
  .refine((p) => new Set(p.variants.map((v) => v.label.toLowerCase())).size === p.variants.length, {
    message: 'Deux variantes portent la même valeur.',
    path: ['variants'],
  });

export type CreateProductInput = z.infer<typeof createProductBody>;

/** Modification : seuls les champs envoyés changent. L'adresse reste stable (liens et référencement). */
export const updateProductBody = z
  .strictObject({
    name: productFields.name,
    categoryId: productFields.categoryId,
    brand: text(1, 60).nullable(),
    shortDescription: productFields.shortDescription,
    description: z.array(text(1, 3_000)).max(20),
    specs: z.array(spec).max(40),
    usageTips: text(1, 2_000).nullable(),
    vatRate: z.number().min(0).max(100),
    hsCode: text(2, 20).nullable(),
    featured: z.boolean(),
    isNew: z.boolean(),
    dealOfTheDay: z.boolean(),
    tags: z.array(text(1, 40)).max(20),
    promotion,
    images: z.array(imageUrl).min(1, 'Gardez au moins une image.').max(12),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdateProductInput = z.infer<typeof updateProductBody>;

export const productStatusBody = z.strictObject({ status: z.enum(['draft', 'published', 'archived']) });

/** Nouvelle variante : son attribut reprend l'option des variantes existantes (Taille, Couleur…). */
export const addVariantBody = variantInput;

export type AddVariantInput = z.infer<typeof addVariantBody>;

/** Modification d'une variante. Le stock passe par les mouvements de stock, jamais par ici. */
export const updateVariantBody = z
  .strictObject({
    label: text(1, 60),
    price: amount,
    cost: amount.nullable(),
    lowStockThreshold: z.int().min(0).max(1_000),
    image: imageUrl.nullable(),
    weightGrams: z.int().min(1).max(1_000_000).nullable(),
    /** Obligatoire quand le prix change : conservé dans l'historique des prix */
    priceReason: text(5, 300),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdateVariantInput = z.infer<typeof updateVariantBody>;

/** Historique des prix : pagination, produit facultatif */
export const priceChangesQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({ productId: z.uuid().optional() })
  .strict();

export type PriceChangesQuery = z.infer<typeof priceChangesQuery>;

export const listStaffProductsQuery = listQuery(['updatedAt'])
  .pick({ page: true, limit: true, search: true })
  .extend({
    status: z.enum(['draft', 'published', 'archived']).optional(),
    categoryId: z.uuid().optional(),
  })
  .strict();

export type ListStaffProductsQuery = z.infer<typeof listStaffProductsQuery>;

export const variantRouteParams = z.strictObject({ id: z.uuid(), variantId: z.uuid() });
