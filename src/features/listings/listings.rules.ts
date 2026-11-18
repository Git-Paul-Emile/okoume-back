import { accessState, isVisible } from '../shops/shops.rules.js';
import type { ListingFields, ListingRecord, ListingStatus } from './listings.repository.js';

/** Une modification de ces champs repasse la vérification (32.3) : prix, photos, description, et ce qui les situe. */
const REVIEWED_FIELDS = ['title', 'description', 'price', 'photos', 'categoryId', 'kind', 'condition'] as const;

export const needsReview = (changes: Partial<ListingFields>) => REVIEWED_FIELDS.some((f) => changes[f] !== undefined);

/** États depuis lesquels le vendeur peut (re)soumettre son annonce. La modération humaine en cours le bloque. */
export const SUBMITTABLE: ListingStatus[] = [
  'draft',
  'changes_requested',
  'withdrawn',
  'published',
  'in_review',
  'sold',
];

/** Un refus est définitif ; une annonce en modération attend la décision sans pouvoir être modifiée. */
export const EDITABLE: ListingStatus[] = ['draft', 'in_review', 'changes_requested', 'published', 'withdrawn', 'sold'];

/** Un produit a un état et une quantité, un service n'en a pas (même règle que listings_kind_fields). */
export function kindFieldsError(listing: Pick<ListingFields, 'kind' | 'condition' | 'quantity'>) {
  if (listing.kind === 'product')
    return listing.condition && listing.quantity !== null ? null : 'Indiquez l’état et la quantité du produit.';
  return listing.condition === null && listing.quantity === null ? null : 'Un service n’a ni état ni quantité.';
}

/** La boutique de l'annonce a un accès en cours ou en délai de grâce, et n'est pas suspendue. */
export function shopVisible(listing: ListingRecord, now: Date, graceDays: number) {
  const { status, planKind, accessEndsAt, inTrial } = listing.shop;
  return isVisible(accessState({ status, planKind, accessEndsAt, inTrial }, now, graceDays));
}

/** Annonce proposée au public (recherche, signalement, demande) : publiée, dans une boutique visible. */
export const publiclyVisible = (listing: ListingRecord, now: Date, graceDays: number) =>
  listing.status === 'published' && shopVisible(listing, now, graceDays);

/** Début du mois en cours (UTC), pour le plafond mensuel de vérifications automatiques (16.6). */
export const startOfMonth = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export interface Position {
  latitude: number;
  longitude: number;
}

/**
 * Position de l'acheteur arrondie au centième de degré (environ 1 km) avant tout calcul (32.4) : la recherche ne
 * travaille jamais sur la position exacte, qui n'est ni conservée ni associée au compte.
 */
export const approximate = ({ latitude, longitude }: Position): Position => ({
  latitude: Math.round(latitude * 100) / 100,
  longitude: Math.round(longitude * 100) / 100,
});

const EARTH_RADIUS_KM = 6371;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distance à vol d'oiseau (formule de haversine), même calcul que la requête SQL de recherche. */
export function distanceKm(a: Position, b: Position) {
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance affichée « à environ N km », jamais moins de 1 km : elle ne permet pas de situer le vendeur. */
export const displayedKm = (km: number) => Math.max(1, Math.round(km));

/** Rectangle qui contient le cercle de recherche : préfiltre indexé avant le calcul exact de la distance. */
export function boundingBox(center: Position, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos(radians(center.latitude))));
  return {
    minLat: center.latitude - dLat,
    maxLat: center.latitude + dLat,
    minLng: center.longitude - dLng,
    maxLng: center.longitude + dLng,
  };
}
