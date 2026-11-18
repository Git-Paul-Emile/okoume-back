import { z } from 'zod';
import { listQuery, MAX_PAGE_SIZE } from '../../core/validation/common.schemas.js';

const photoUrl = z.url({ protocol: /^https$/, error: 'Photo : adresse HTTPS attendue.' }).max(500);

const fields = {
  title: z.string().trim().min(5, 'Titre trop court.').max(100),
  description: z.string().trim().min(20, 'Décrivez l’article en quelques phrases.').max(5_000),
  categoryId: z.uuid(),
  kind: z.enum(['product', 'service']),
  condition: z.enum(['new', 'like_new', 'good', 'used']).nullable(),
  price: z.int().min(1).max(1_000_000_000),
  quantity: z.int().min(0).max(100_000).nullable(),
  city: z.string().trim().min(2).max(60),
  district: z.string().trim().min(2).max(80),
  /** Photos déjà envoyées à l'hébergeur d'images (POST /seller/media/upload-signatures), dans l'ordre d'affichage */
  photos: z.array(photoUrl).max(8, '8 photos au plus.'),
  /** Négociation (32.5) : prix minimum accepté, ou réduction maximale en pourcentage ; null : pas de négociation */
  minPrice: z.int().min(1).max(1_000_000_000).nullable(),
  maxDiscountPercent: z.int().min(1).max(90),
  /** Consignes pour le tchat : remise en main propre, horaires, ce que le vendeur accepte ou non */
  sellerNotes: z.string().trim().max(2_000),
};

/** Brouillon d'annonce (32.3). Ville et quartier par défaut : ceux de la boutique. */
export const createListingBody = z.strictObject({
  ...fields,
  condition: fields.condition.default(null),
  quantity: fields.quantity.default(null),
  city: fields.city.optional(),
  district: fields.district.optional(),
  photos: fields.photos.default([]),
  minPrice: fields.minPrice.default(null),
  maxDiscountPercent: fields.maxDiscountPercent.optional(),
  sellerNotes: fields.sellerNotes.default(''),
});

export type CreateListingInput = z.infer<typeof createListingBody>;

/** Les champs propres au produit ou au service sont vérifiés après fusion avec l'annonce, par le service. */
export const updateListingBody = z
  .strictObject(fields)
  .partial()
  .refine((l) => Object.keys(l).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdateListingInput = z.infer<typeof updateListingBody>;

export const listMyListingsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({
    status: z
      .enum([
        'draft',
        'in_review',
        'changes_requested',
        'pending_moderation',
        'published',
        'rejected',
        'withdrawn',
        'sold',
      ])
      .optional(),
  })
  .strict();

export type ListMyListingsQuery = z.infer<typeof listMyListingsQuery>;

export const publicPageQuery = listQuery(['createdAt']).pick({ page: true, limit: true }).strict();

export type PublicPageQuery = z.infer<typeof publicPageQuery>;

export const reportBody = z.strictObject({
  reason: z.enum([
    'prohibited',
    'scam',
    'misleading',
    'offensive',
    'personal_data',
    'inappropriate_photos',
    'spam',
    'other',
  ]),
  comment: z.string().trim().max(500).default(''),
});

export type ReportInput = z.infer<typeof reportBody>;

export const listingSlugParam = z.strictObject({
  slug: z.string().regex(/^[a-z0-9-]{1,140}$/, 'Adresse invalide.'),
});

const CONDITIONS = ['new', 'like_new', 'good', 'used'] as const;

/** Critères communs aux deux routes de recherche (32.4). */
const searchFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  search: z.string().trim().min(1).max(100).optional(),
  category: z
    .string()
    .regex(/^[a-z0-9-]{1,100}$/)
    .optional(),
  kind: z.enum(['product', 'service']).optional(),
  /** Plusieurs états séparés par des virgules dans l'URL : condition=new,like_new */
  condition: z
    .union([z.array(z.enum(CONDITIONS)), z.string().transform((v) => v.split(','))])
    .pipe(z.array(z.enum(CONDITIONS)).max(CONDITIONS.length))
    .optional(),
  city: z.string().trim().min(2).max(60).optional(),
  district: z.string().trim().min(2).max(80).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['relevance', '-publishedAt', 'price', '-price', 'distance']).optional(),
};

/** Recherche sans position, en GET : elle peut être mise en cache et partagée par lien. */
export const listingsSearchQuery = z.strictObject(searchFields).refine((q) => q.sort !== 'distance', {
  path: ['sort'],
  message: 'Le tri par distance demande votre position (POST /listings/searches).',
});

export type ListingsSearchQuery = z.infer<typeof listingsSearchQuery>;

/**
 * Recherche avec la position de l'acheteur, en POST : la position voyage dans le corps de la requête, jamais
 * journalisé, et non dans l'adresse, que les journaux des serveurs et des intermédiaires conservent (32.4).
 */
export const listingsNearbyBody = z.strictObject({
  ...searchFields,
  position: z.strictObject({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  /** Rayon en kilomètres ; sans rayon, toutes les annonces, les plus proches d'abord */
  maxKm: z.number().min(1).max(500).optional(),
});

export type ListingsNearbyInput = z.infer<typeof listingsNearbyBody>;
