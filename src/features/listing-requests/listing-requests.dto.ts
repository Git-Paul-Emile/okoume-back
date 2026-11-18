import type { RequestRecord, RequestStatus } from './listing-requests.repository.js';

/** Les coordonnées ne s'échangent qu'une fois la demande acceptée : avant, chacun ne voit que le nécessaire. */
const CONTACT_SHARED: RequestStatus[] = ['accepted', 'concluded', 'not_concluded'];

const common = (request: RequestRecord) => ({
  id: request.id,
  number: request.number,
  listing: { slug: request.listing.slug, title: request.listingTitle },
  quantity: request.quantity,
  unitPrice: request.unitPrice,
  total: request.total,
  paymentMethod: request.paymentMethod,
  handover: request.handover,
  message: request.message,
  status: request.status,
  reason: request.reason,
  history: request.events.map((e) => ({
    status: e.status,
    actor: e.actor,
    note: e.note,
    at: e.createdAt.toISOString(),
  })),
  createdAt: request.createdAt.toISOString(),
});

/** Vue de l'acheteur : le téléphone de la boutique après acceptation. Aucun statut « payé » n'existe. */
export const toBuyerRequestDto = (request: RequestRecord) => ({
  ...common(request),
  shop: {
    slug: request.shop.slug,
    name: request.shop.name,
    phone: CONTACT_SHARED.includes(request.status) ? request.shop.phone : null,
  },
});

/** Vue du vendeur : le prénom de l'acheteur, et son téléphone après acceptation ; jamais son adresse e-mail. */
export const toSellerRequestDto = (request: RequestRecord) => ({
  ...common(request),
  buyer: {
    firstName: request.buyer.firstName,
    phone: CONTACT_SHARED.includes(request.status) ? request.contactPhone : null,
  },
});
