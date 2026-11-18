import { randomUUID } from 'node:crypto';
import type {
  ListingRequestsRepository,
  RequestRecord,
  RequestStatus,
} from '../src/features/listing-requests/listing-requests.repository.js';
import type { ListingsRepository, ListingStatus } from '../src/features/listings/listings.repository.js';
import type { OwnerRecord, ShopsRepository } from '../src/features/shops/shops.repository.js';

type Stored = Omit<RequestRecord, 'listing' | 'shop' | 'buyer'> & {
  listingId: string;
  shopId: string;
  buyerId: string;
};

/**
 * Demandes de commande en mémoire, même contrat que Prisma : une demande ouverte par acheteur et par annonce, une
 * conclusion tout ou rien qui retire la quantité de l'annonce et la marque vendue une fois épuisée.
 */
export function createMemoryListingRequests(store: {
  listings: ListingsRepository;
  /** Accès direct aux annonces en mémoire, pour la quantité et l'état modifiés à la conclusion */
  storedListings: Array<{ id: string; quantity: number | null; status: ListingStatus }>;
  shops: ShopsRepository;
}) {
  const requests: Stored[] = [];

  async function toRecord({ listingId, shopId, buyerId, ...request }: Stored): Promise<RequestRecord> {
    const listing = await store.listings.findById(listingId);
    const shop = await store.shops.findById(shopId);
    const buyer: OwnerRecord | null = await store.shops.findOwner(buyerId);
    if (!listing || !shop) throw new Error('Annonce ou boutique absente');
    return {
      ...request,
      events: [...request.events],
      listing: { id: listing.id, slug: listing.slug, kind: listing.kind },
      shop: { id: shop.id, slug: shop.slug, name: shop.name, ownerId: shop.ownerId, phone: shop.phone },
      buyer: { id: buyerId, firstName: buyer?.firstName ?? 'Client', email: buyer?.email ?? `${buyerId}@example.ga` },
    };
  }

  const event = (status: RequestStatus, actor: 'buyer' | 'seller', note: string | null, at: Date) => ({
    status,
    actor,
    note,
    createdAt: at,
  });

  const repository: ListingRequestsRepository = {
    async create(request, at) {
      const open = requests.some(
        (r) =>
          r.listingId === request.listingId && r.buyerId === request.buyerId && ['sent', 'accepted'].includes(r.status),
      );
      if (open) return 'already_open';
      if (requests.some((r) => r.number === request.number)) return 'number_taken';
      const stored: Stored = {
        ...request,
        id: randomUUID(),
        total: request.unitPrice * (request.quantity ?? 1),
        status: 'sent',
        reason: null,
        createdAt: at,
        events: [event('sent', 'buyer', null, at)],
      };
      requests.push(stored);
      return toRecord(stored);
    },
    async findById(id) {
      const request = requests.find((r) => r.id === id);
      return request ? toRecord(request) : null;
    },
    async list({ shopId, buyerId, status, page, limit }) {
      const found = requests
        .filter((r) => (!shopId || r.shopId === shopId) && (!buyerId || r.buyerId === buyerId))
        .filter((r) => !status || r.status === status)
        .reverse();
      return {
        items: await Promise.all(found.slice((page - 1) * limit, page * limit).map(toRecord)),
        total: found.length,
      };
    },
    async transition(id, { from, to, actor, reason, at }) {
      const request = requests.find((r) => r.id === id);
      if (!request || !from.includes(request.status)) return null;
      request.status = to;
      if (reason !== null) request.reason = reason;
      request.events.push(event(to, actor, reason, at));
      return toRecord(request);
    },
    async conclude(id, at) {
      const request = requests.find((r) => r.id === id);
      if (request?.status !== 'accepted') return 'stale';
      const listing = store.storedListings.find((l) => l.id === request.listingId)!;
      if (request.quantity !== null) {
        if ((listing.quantity ?? 0) < request.quantity) return 'insufficient';
        listing.quantity = (listing.quantity ?? 0) - request.quantity;
        if (listing.quantity === 0 && listing.status === 'published') listing.status = 'sold';
      }
      request.status = 'concluded';
      request.events.push(event('concluded', 'seller', null, at));
      return toRecord(request);
    },
  };

  return { repository, requests };
}
