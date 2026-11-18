import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  UnprocessableError,
} from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { randomReadableCode } from '../../core/security/secrets.js';
import { slugify } from '../../core/text/slugify.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import type { MediaStorage } from '../../infrastructure/media/mediaStorage.js';
import type { JobQueue } from '../../infrastructure/queue/jobQueue.js';
import { logger } from '../../lib/logger.js';
import type { Notifier } from '../notifications/notifier.js';
import type { ShopRecord, ShopsRepository } from '../shops/shops.repository.js';
import type { ListingViewsRecorder } from '../seller-dashboard/seller-dashboard.repository.js';
import { librevilleDay } from '../seller-dashboard/seller-dashboard.rules.js';
import { fcfa } from '../../core/text/fcfa.js';
import { floorFrom } from '../chat/chat.rules.js';
import { toPublicListingDto, toSellerListingDto } from './listings.dto.js';
import type { ListingFields, ListingRecord, ListingsRepository } from './listings.repository.js';
import {
  approximate,
  displayedKm,
  EDITABLE,
  kindFieldsError,
  needsReview,
  publiclyVisible,
  shopVisible,
  SUBMITTABLE,
} from './listings.rules.js';
import type {
  CreateListingInput,
  ListingsNearbyInput,
  ListingsSearchQuery,
  ListMyListingsQuery,
  PublicPageQuery,
  ReportInput,
  UpdateListingInput,
} from './listings.schemas.js';

const SLUG_ATTEMPTS = 5;

export interface ListingsDependencies {
  listings: ListingsRepository;
  shops: ShopsRepository;
  queue: JobQueue;
  email: EmailSender;
  notifier: Notifier;
  /** null : hébergement d'images non configuré ; toute adresse HTTPS est alors acceptée (développement) */
  media: MediaStorage | null;
  /** Compteur des visites de la fiche publique (32.8) */
  views: ListingViewsRecorder;
  appUrl: string;
  /** Adresse publique de l'API, pour les liens de partage avec aperçu ; null : lien direct vers le site */
  shareBaseUrl: string | null;
  now: () => Date;
}

/** Annonces des vendeurs tiers, côté vendeur et côté public, et signalements (cahier des charges, 32.3). */
export const createListingsService = (deps: ListingsDependencies) => {
  const { listings, shops, queue, media, notifier, now } = deps;

  async function ownShop(customerId: string) {
    const shop = await shops.findByOwner(customerId);
    if (!shop) throw new NotFoundError('Ouvrez d’abord votre boutique.');
    return shop;
  }

  function writable(shop: ShopRecord) {
    if (shop.status === 'suspended')
      throw new ConflictError('Votre boutique est suspendue : ses annonces ne peuvent pas être modifiées.');
  }

  /** Une annonce d'une autre boutique répond 404, comme une annonce inexistante (protection IDOR). */
  async function ownListing(customerId: string, id: string) {
    const listing = await listings.findById(id);
    if (!listing || listing.shop.ownerId !== customerId) throw new NotFoundError('Annonce introuvable.');
    return listing;
  }

  async function sellerView(listing: ListingRecord) {
    const [last] = await listings.reviews(listing.id);
    return toSellerListingDto(listing, last ?? null);
  }

  /**
   * Prix minimum de négociation (32.5) à partir du réglage du vendeur : prix plancher ou réduction maximale.
   * Il ne dépasse jamais le prix affiché.
   */
  function negotiationFloor(price: number, setting: { minPrice?: number | null; maxDiscountPercent?: number }) {
    const floor = floorFrom(price, setting);
    if (floor !== null && floor > price)
      throw new UnprocessableError('Le prix minimum de négociation ne peut pas dépasser le prix affiché.');
    return floor;
  }

  async function checkCategory(categoryId: string) {
    const category = await listings.categoryLabel(categoryId);
    if (!category || category.isCollection) throw new UnprocessableError('Choisissez une catégorie du catalogue.');
  }

  /**
   * Une photo vérifiée doit rester celle qui a été vérifiée : seules les images de notre hébergeur sont acceptées.
   * Sans hébergeur configuré, aucune photo n'est acceptée (une adresse quelconque échapperait à la vérification).
   */
  function checkPhotos(photos: string[]) {
    if (photos.length && (!media || photos.some((url) => !media.isHostedUrl(url))))
      throw new UnprocessableError('Envoyez vos photos depuis votre espace vendeur.');
  }

  /** Annonce montrée au public : publiée ou vendue, dans une boutique visible. */
  async function shownListing(slug: string) {
    const listing = await listings.findBySlug(slug);
    const { graceDays } = await shops.settings();
    const shown = listing && ['published', 'sold'].includes(listing.status) && shopVisible(listing, now(), graceDays);
    if (!listing || !shown) throw new NotFoundError('Annonce introuvable.');
    return listing;
  }

  async function visibleListing(slug: string) {
    const listing = await listings.findBySlug(slug);
    const { graceDays } = await shops.settings();
    if (!listing || !publiclyVisible(listing, now(), graceDays)) throw new NotFoundError('Annonce introuvable.');
    return listing;
  }

  /**
   * Dépose la vérification dans la file. Si le dépôt échoue, l'annonce part en modération humaine plutôt que de
   * rester bloquée en attente d'un avis qui ne viendra pas.
   */
  async function requestReview(listing: ListingRecord, version: number) {
    try {
      await queue.send('listings.review', { listingId: listing.id, version });
    } catch (err) {
      logger.error({ err, listingId: listing.id }, 'Vérification d’annonce non déposée');
      await listings.applyReview(
        listing.id,
        { version, statuses: ['in_review'] },
        {
          source: 'ai',
          outcome: 'moderation',
          issues: [],
          reason: 'Vérification automatique indisponible',
          model: null,
          staffId: null,
        },
        'pending_moderation',
        now(),
      );
    }
  }

  async function submitListing(listing: ListingRecord) {
    if (listing.kind === 'product' && listing.photos.length === 0)
      throw new UnprocessableError('Ajoutez au moins une photo du produit.');
    const version = await listings.submit(listing.id, SUBMITTABLE, now());
    if (version === null) throw new ConflictError('Cette annonce ne peut pas être soumise dans son état actuel.');
    await requestReview(listing, version);
  }

  return {
    /** Autorisation d'envoi d'une photo d'annonce, vers le dossier des annonces et rien d'autre. */
    async signPhotoUpload(customerId: string) {
      writable(await ownShop(customerId));
      if (!media) throw new ServiceUnavailableError('L’envoi de photos n’est pas encore configuré.');
      const upload = media.signUpload('listings', now());
      return { ...upload, expiresAt: upload.expiresAt.toISOString() };
    },

    /** Brouillon : rien n'est vérifié ni publié avant la soumission. */
    async create(customerId: string, input: CreateListingInput) {
      const shop = await ownShop(customerId);
      writable(shop);
      const error = kindFieldsError(input);
      if (error) throw new UnprocessableError(error);
      await checkCategory(input.categoryId);
      checkPhotos(input.photos);
      const { maxDiscountPercent, ...fields } = input;
      const minPrice = negotiationFloor(
        fields.price,
        maxDiscountPercent !== undefined ? { maxDiscountPercent } : { minPrice: fields.minPrice },
      );
      const base = slugify(input.title) || 'annonce';
      for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
        const result = await listings.create({
          ...fields,
          minPrice,
          city: input.city ?? shop.city,
          district: input.district ?? shop.district,
          shopId: shop.id,
          slug: `${base}-${randomReadableCode(6).toLowerCase()}`,
        });
        if (result !== 'slug_taken') return sellerView(result);
      }
      throw new Error('Impossible d’attribuer une adresse unique à l’annonce.');
    },

    async mine(customerId: string, query: ListMyListingsQuery) {
      const shop = await ownShop(customerId);
      const { items, total } = await listings.list({
        shopId: shop.id,
        statuses: query.status ? [query.status] : undefined,
        page: query.page,
        limit: query.limit,
      });
      return paginate(await Promise.all(items.map(sellerView)), total, query.page, query.limit);
    },

    async get(customerId: string, id: string) {
      return sellerView(await ownListing(customerId, id));
    },

    /**
     * Modification : un refus est définitif et une modération en cours attend sa décision. Une annonce déjà
     * soumise ou publiée dont le prix, les photos ou la description changent repasse la vérification.
     */
    async update(customerId: string, id: string, input: UpdateListingInput) {
      const listing = await ownListing(customerId, id);
      writable(await ownShop(customerId));
      if (!EDITABLE.includes(listing.status))
        throw new ConflictError(
          listing.status === 'rejected'
            ? 'Cette annonce a été refusée : elle ne peut plus être modifiée.'
            : 'Cette annonce est en cours d’examen : attendez la décision avant de la modifier.',
        );
      const merged = { kind: listing.kind, condition: listing.condition, quantity: listing.quantity, ...input };
      const error = kindFieldsError(merged);
      if (error) throw new UnprocessableError(error);
      if (input.categoryId) await checkCategory(input.categoryId);
      if (input.photos) checkPhotos(input.photos);
      const { maxDiscountPercent, ...fields } = input;
      const price = fields.price ?? listing.price;
      let minPrice: number | null | undefined;
      if (maxDiscountPercent !== undefined) minPrice = negotiationFloor(price, { maxDiscountPercent });
      else if (fields.minPrice !== undefined) minPrice = negotiationFloor(price, { minPrice: fields.minPrice });
      else if (listing.minPrice !== null && listing.minPrice > price)
        throw new UnprocessableError('Le nouveau prix est sous votre prix minimum de négociation : ajustez-le aussi.');
      const changes: Partial<ListingFields> = { ...fields, ...(minPrice !== undefined ? { minPrice } : {}) };
      const updated = await listings.update(listing.id, changes);
      if (needsReview(changes) && ['in_review', 'published', 'sold'].includes(listing.status))
        await submitListing(updated);
      // Réassort d'une annonce vendue : la quantité n'est pas vérifiée, l'annonce revient en ligne telle quelle
      else if (listing.status === 'sold' && (input.quantity ?? 0) > 0)
        await listings.setStatus(listing.id, ['sold'], 'published');
      return sellerView((await listings.findById(listing.id)) ?? updated);
    },

    async submit(customerId: string, id: string) {
      const listing = await ownListing(customerId, id);
      writable(await ownShop(customerId));
      await submitListing(listing);
      return sellerView((await listings.findById(id)) ?? listing);
    },

    /** Retrait par le vendeur : l'annonce n'est plus visible, elle pourra être soumise de nouveau. */
    async withdraw(customerId: string, id: string) {
      const listing = await ownListing(customerId, id);
      if (
        !(await listings.setStatus(
          listing.id,
          ['draft', 'in_review', 'changes_requested', 'published', 'sold'],
          'withdrawn',
        ))
      )
        throw new ConflictError('Cette annonce ne peut pas être retirée dans son état actuel.');
      return sellerView((await listings.findById(id)) ?? listing);
    },

    /**
     * Recherche publique (32.4). Avec une position, elle est d'abord arrondie (environ 1 km) puis oubliée : seule la
     * distance arrondie revient, jamais la position de la boutique. Sans position, classement par défaut :
     * pertinence pour une recherche par mots, sinon les plus récentes.
     */
    async search(input: ListingsSearchQuery | ListingsNearbyInput) {
      const near = 'position' in input ? approximate(input.position) : undefined;
      const sort = input.sort ?? (near ? 'distance' : input.search ? 'relevance' : '-publishedAt');
      if (input.minPrice !== undefined && input.maxPrice !== undefined && input.minPrice > input.maxPrice)
        throw new UnprocessableError('Le prix minimum dépasse le prix maximum.');
      const { graceDays } = await shops.settings();
      const { hits, total } = await listings.search({
        search: input.search,
        categorySlug: input.category,
        kind: input.kind,
        conditions: input.condition,
        city: input.city,
        district: input.district,
        minPrice: input.minPrice,
        maxPrice: input.maxPrice,
        near,
        maxKm: 'maxKm' in input ? input.maxKm : undefined,
        sort,
        visibleAt: { now: now(), graceDays },
        page: input.page,
        limit: input.limit,
      });
      const distances = new Map(hits.map((h) => [h.id, h.distanceKm] as const));
      const sponsored = new Set(hits.filter((h) => h.sponsored).map((h) => h.id));
      const records = await listings.findByIds(hits.map((h) => h.id));
      const items = records.map((listing) => {
        const km = distances.get(listing.id);
        return {
          ...toPublicListingDto(listing),
          distanceKm: km === undefined || km === null ? null : displayedKm(km),
          sponsored: sponsored.has(listing.id),
        };
      });
      return paginate(items, total, input.page, input.limit);
    },

    /**
     * Fiche publique : une annonce vendue reste consultable (liens partagés), sans demande possible. La visite est
     * comptée, sauf celle du vendeur lui-même ; un échec du compteur ne prive jamais l'acheteur de la fiche.
     */
    async publicListing(slug: string, viewerId?: string) {
      const listing = await shownListing(slug);
      if (viewerId !== listing.shop.ownerId)
        await deps.views.recordView(listing.id, librevilleDay(now())).catch((err: unknown) => {
          logger.warn({ err, listingId: listing.id }, 'Visite d’annonce non comptée');
        });
      return toPublicListingDto(listing);
    },

    /**
     * Partage manuel (32.9) : le vendeur copie le lien ou utilise le menu de partage de son appareil, et publie
     * lui-même. Okoumé ne publie rien sur ses comptes. Avec l'adresse de l'API, le lien affiche un aperçu (titre,
     * photo, prix) sur WhatsApp et Facebook.
     */
    async share(customerId: string, id: string) {
      const listing = await ownListing(customerId, id);
      if (!['published', 'sold'].includes(listing.status))
        throw new ConflictError('Seule une annonce publiée peut être partagée.');
      const url = `${deps.appUrl}/annonces/${listing.slug}`;
      const link = deps.shareBaseUrl ? `${deps.shareBaseUrl}/partage/annonces/${listing.slug}` : url;
      const text = `${listing.title} : ${fcfa(listing.price)} sur Okoumé`;
      return {
        url,
        link,
        text,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
      };
    },

    /** Données de l'aperçu d'un lien partagé : titre, description, photo et page de l'annonce sur le site. */
    async sharePreview(slug: string) {
      const listing = await shownListing(slug);
      return {
        title: `${listing.title} : ${fcfa(listing.price)}`,
        description: listing.description.slice(0, 200),
        image: listing.photos[0] ?? null,
        url: `${deps.appUrl}/annonces/${listing.slug}`,
      };
    },

    /** Annonces publiées d'une boutique visible, les plus récentes d'abord. */
    async shopListings(shopSlug: string, query: PublicPageQuery) {
      const shop = await shops.findBySlug(shopSlug);
      if (!shop) throw new NotFoundError('Boutique introuvable.');
      const { graceDays } = await shops.settings();
      const { items, total } = await listings.list({
        shopId: shop.id,
        visibleAt: { now: now(), graceDays },
        page: query.page,
        limit: query.limit,
      });
      return paginate(items.map(toPublicListingDto), total, query.page, query.limit);
    },

    /** Signalement par un client connecté (13.4) : il déclenche un examen humain ; l'annonce reste visible. */
    async report(customerId: string, slug: string, input: ReportInput) {
      const listing = await visibleListing(slug);
      if (listing.shop.ownerId === customerId)
        throw new UnprocessableError('Vous ne pouvez pas signaler votre propre annonce.');
      const report = await listings.createReport({ listingId: listing.id, reporterId: customerId, ...input });
      if (report === 'already_open') throw new ConflictError('Vous avez déjà signalé cette annonce.');
      await notifier.notifyStaff('vendeurs:valider', {
        title: 'Annonce signalée',
        body: listing.title,
        url: `${deps.appUrl}/admin/annonces/${listing.id}`,
        tag: `signalement-${listing.id}`,
      });
      return { id: report.id, status: report.status };
    },
  };
};

export type ListingsService = ReturnType<typeof createListingsService>;
