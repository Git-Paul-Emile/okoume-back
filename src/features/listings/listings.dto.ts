import type { ListingRecord, ReportRecord, ReviewRecord } from './listings.repository.js';

const iso = (d: Date | null) => d?.toISOString() ?? null;

const common = (listing: ListingRecord) => ({
  slug: listing.slug,
  title: listing.title,
  description: listing.description,
  category: listing.category,
  kind: listing.kind,
  condition: listing.condition,
  price: listing.price,
  quantity: listing.quantity,
  city: listing.city,
  district: listing.district,
  photos: listing.photos,
});

/** Fiche publique : la boutique se présente par son nom et son badge, jamais par ses coordonnées. */
export const toPublicListingDto = (listing: ListingRecord) => ({
  ...common(listing),
  shop: { slug: listing.shop.slug, name: listing.shop.name, verified: listing.shop.verified },
  /** Quantité épuisée : la fiche reste consultable, sans demande possible */
  sold: listing.status === 'sold',
  publishedAt: iso(listing.publishedAt),
});

const toReviewDto = (review: ReviewRecord) => ({
  version: review.version,
  source: review.source,
  outcome: review.outcome,
  issues: review.issues,
  reason: review.reason,
  createdAt: review.createdAt.toISOString(),
});

/**
 * Fiche du vendeur : état de l'annonce et dernier avis reçu, pour corriger. Le modèle d'IA utilisé reste une
 * information interne (traçabilité côté administration).
 */
export const toSellerListingDto = (listing: ListingRecord, lastReview: ReviewRecord | null) => ({
  id: listing.id,
  ...common(listing),
  status: listing.status,
  negotiation: { minPrice: listing.minPrice, sellerNotes: listing.sellerNotes },
  lastReview: lastReview ? toReviewDto(lastReview) : null,
  submittedAt: iso(listing.submittedAt),
  publishedAt: iso(listing.publishedAt),
  createdAt: listing.createdAt.toISOString(),
});

/** Fiche de modération : historique complet des vérifications, IA comprise, et boutique concernée. */
export const toStaffListingDto = (listing: ListingRecord, reviews: ReviewRecord[], openReports: number) => ({
  id: listing.id,
  ...common(listing),
  status: listing.status,
  version: listing.version,
  shop: { id: listing.shop.id, slug: listing.shop.slug, name: listing.shop.name, status: listing.shop.status },
  reviews: reviews.map((r) => ({ ...toReviewDto(r), model: r.model })),
  openReports,
  submittedAt: iso(listing.submittedAt),
  publishedAt: iso(listing.publishedAt),
  createdAt: listing.createdAt.toISOString(),
});

export const toReportDto = (report: ReportRecord) => ({
  id: report.id,
  listing: report.listing,
  reason: report.reason,
  comment: report.comment,
  status: report.status,
  decidedAt: iso(report.decidedAt),
  createdAt: report.createdAt.toISOString(),
});
