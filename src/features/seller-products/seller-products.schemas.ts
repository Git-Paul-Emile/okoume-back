import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

const MAX_AMOUNT = 100_000_000;
const MAX_UNITS = 100_000;

const amount = z.int('Montant entier en FCFA.').min(1, 'Indiquez un prix.').max(MAX_AMOUNT);
/** Adresse d'image : HTTPS uniquement (stockage de fichiers du site). */
const imageUrl = z.url({ protocol: /^https$/, message: 'Adresse d’image HTTPS attendue.' }).max(500);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const condition = z.enum(['new', 'like_new', 'good', 'used'], 'Choisissez l’état du produit.');
const spec = z.strictObject({ label: text(1, 60), value: text(1, 200) });

const variantInput = z.strictObject({
  label: text(1, 60),
  price: amount,
  stock: z.int().min(0).max(MAX_UNITS).default(0),
  image: imageUrl.nullable().default(null),
});

const productFields = {
  name: text(3, 120),
  categoryId: z.uuid('Choisissez une catégorie.'),
  brand: text(1, 60).nullable().default(null),
  shortDescription: text(10, 300),
  description: z.array(text(1, 3_000)).max(20).default([]),
  specs: z.array(spec).max(40).default([]),
  usageTips: text(1, 2_000).nullable().default(null),
  condition,
};

/**
 * Nouveau produit d'un vendeur (32.3). « submit » le soumet aussitôt à la vérification ; sinon il reste en brouillon.
 * Plusieurs variantes demandent le nom de l'option qui les distingue (Taille, Couleur…).
 */
export const createSellerProductBody = z
  .strictObject({
    ...productFields,
    images: z.array(imageUrl).min(1, 'Ajoutez au moins une photo.').max(12),
    optionName: text(1, 40).nullable().default(null),
    variants: z.array(variantInput).min(1).max(50),
    submit: z.boolean().default(true),
  })
  .refine((p) => p.variants.length === 1 || p.optionName !== null, {
    message: 'Indiquez ce qui distingue les variantes (Taille, Couleur…).',
    path: ['optionName'],
  })
  .refine((p) => new Set(p.variants.map((v) => v.label.toLowerCase())).size === p.variants.length, {
    message: 'Deux variantes portent la même valeur.',
    path: ['variants'],
  });

export type CreateSellerProductInput = z.infer<typeof createSellerProductBody>;

/** Modification : seuls les champs envoyés changent ; un produit déjà soumis repasse la vérification. */
export const updateSellerProductBody = z
  .strictObject({
    name: productFields.name,
    categoryId: productFields.categoryId,
    brand: text(1, 60).nullable(),
    shortDescription: productFields.shortDescription,
    description: z.array(text(1, 3_000)).max(20),
    specs: z.array(spec).max(40),
    usageTips: text(1, 2_000).nullable(),
    condition,
    images: z.array(imageUrl).min(1, 'Gardez au moins une photo.').max(12),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdateSellerProductInput = z.infer<typeof updateSellerProductBody>;

export const addSellerVariantBody = variantInput;
export type AddSellerVariantInput = z.infer<typeof addSellerVariantBody>;

/** Variante : libellé, prix ou photo. Le stock passe par sa propre route, tracée dans le journal. */
export const updateSellerVariantBody = z
  .strictObject({ label: text(1, 60), price: amount, image: imageUrl.nullable() })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdateSellerVariantInput = z.infer<typeof updateSellerVariantBody>;

/** Stock compté par le vendeur : remplace la quantité en stock, avec un motif gardé au journal. */
export const sellerStockBody = z.strictObject({
  counted: z.int('Quantité entière attendue.').min(0).max(MAX_UNITS),
  reason: text(3, 200),
});

export type SellerStockInput = z.infer<typeof sellerStockBody>;

export const listSellerProductsQuery = listQuery(['updatedAt'])
  .pick({ page: true, limit: true, search: true })
  .extend({
    status: z.enum(['draft', 'published', 'archived']).optional(),
    moderation: z.enum(['in_review', 'changes_requested', 'pending_moderation', 'approved', 'rejected']).optional(),
  })
  .strict();

export type ListSellerProductsQuery = z.infer<typeof listSellerProductsQuery>;

export const sellerVariantParams = z.strictObject({ id: z.uuid(), variantId: z.uuid() });
