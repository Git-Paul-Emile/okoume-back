import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export type RequestStatus = 'sent' | 'accepted' | 'refused' | 'cancelled' | 'concluded' | 'not_concluded';

export interface RequestRecord {
  id: string;
  number: string;
  listing: { id: string; slug: string; kind: 'product' | 'service' };
  listingTitle: string;
  shop: { id: string; slug: string; name: string; ownerId: string; phone: string };
  buyer: { id: string; firstName: string; email: string };
  quantity: number | null;
  unitPrice: number;
  total: number;
  paymentMethod: 'cash' | 'airtel' | 'moov';
  handover: 'pickup' | 'seller_delivery';
  contactPhone: string;
  message: string;
  status: RequestStatus;
  reason: string | null;
  createdAt: Date;
  events: Array<{ status: RequestStatus; actor: 'buyer' | 'seller'; note: string | null; createdAt: Date }>;
}

export interface NewRequest {
  number: string;
  listingId: string;
  shopId: string;
  buyerId: string;
  listingTitle: string;
  quantity: number | null;
  unitPrice: number;
  paymentMethod: RequestRecord['paymentMethod'];
  handover: RequestRecord['handover'];
  contactPhone: string;
  message: string;
}

export interface RequestChange {
  from: RequestStatus[];
  to: RequestStatus;
  actor: 'buyer' | 'seller';
  reason: string | null;
  at: Date;
}

/** Contrat des demandes de commande sur les annonces de vendeurs tiers (32.7). */
export interface ListingRequestsRepository {
  /** « already_open » : l'acheteur a déjà une demande envoyée ou acceptée sur cette annonce. */
  create(request: NewRequest, at: Date): Promise<RequestRecord | 'already_open' | 'number_taken'>;
  findById(id: string): Promise<RequestRecord | null>;
  list(query: {
    shopId?: string | undefined;
    buyerId?: string | undefined;
    status?: RequestStatus | undefined;
    page: number;
    limit: number;
  }): Promise<{ items: RequestRecord[]; total: number }>;
  /** Changement d'état gardé, avec son événement d'historique. null : la demande n'était plus dans l'état attendu. */
  transition(id: string, change: RequestChange): Promise<RequestRecord | null>;
  /**
   * Vente conclue, dans une transaction : la demande passe à « conclue », la quantité vendue est retirée de
   * l'annonce, et une annonce publiée épuisée passe à « vendue ». « insufficient » : quantité devenue
   * insuffisante, rien n'est écrit ; « stale » : la demande n'était plus acceptée.
   */
  conclude(id: string, at: Date): Promise<RequestRecord | 'stale' | 'insufficient'>;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const OPEN: RequestStatus[] = ['sent', 'accepted'];

/** Interrompt la transaction de conclusion quand la quantité restante ne suffit plus. */
class InsufficientQuantity extends Error {
  constructor() {
    super('Quantité insuffisante');
  }
}

const include = {
  listing: { select: { id: true, slug: true, kind: true } },
  shop: { select: { id: true, slug: true, name: true, ownerId: true, phone: true } },
  buyer: { select: { id: true, firstName: true, email: true } },
  events: { select: { status: true, actor: true, note: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.ListingRequestInclude;
type Row = Prisma.ListingRequestGetPayload<{ include: typeof include }>;

const toRecord = ({
  unitPrice,
  total,
  listingId: _listingId,
  shopId: _shopId,
  buyerId: _buyerId,
  updatedAt: _updatedAt,
  ...row
}: Row): RequestRecord => ({ ...row, unitPrice: unitPrice.toNumber(), total: total.toNumber() });

export const listingRequestsRepository: ListingRequestsRepository = {
  async create(request, at) {
    const open = await prisma.listingRequest.findFirst({
      where: { listingId: request.listingId, buyerId: request.buyerId, status: { in: OPEN } },
      select: { id: true },
    });
    if (open) return 'already_open';
    if (await prisma.listingRequest.findUnique({ where: { number: request.number }, select: { id: true } }))
      return 'number_taken';
    try {
      const row = await prisma.listingRequest.create({
        data: {
          ...request,
          total: request.unitPrice * (request.quantity ?? 1),
          createdAt: at,
          events: { create: { status: 'sent', actor: 'buyer', createdAt: at } },
        },
        include,
      });
      return toRecord(row);
    } catch (error) {
      // Course entre deux envois : l'index unique partiel a tranché
      if (isUniqueViolation(error)) return 'already_open';
      throw error;
    }
  },

  async findById(id) {
    const row = await prisma.listingRequest.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  },

  async list({ shopId, buyerId, status, page, limit }) {
    const where: Prisma.ListingRequestWhereInput = {
      ...(shopId ? { shopId } : {}),
      ...(buyerId ? { buyerId } : {}),
      ...(status ? { status } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.listingRequest.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.listingRequest.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  },

  async transition(id, { from, to, actor, reason, at }) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.listingRequest.updateMany({
        where: { id, status: { in: from } },
        data: { status: to, ...(reason !== null ? { reason } : {}) },
      });
      if (!count) return null;
      await tx.listingRequestEvent.create({
        data: { requestId: id, status: to, actor, note: reason, createdAt: at },
        select: { id: true },
      });
      return toRecord(await tx.listingRequest.findUniqueOrThrow({ where: { id }, include }));
    });
  },

  async conclude(id, at) {
    return prisma
      .$transaction(async (tx) => {
        const request = await tx.listingRequest.findUnique({
          where: { id },
          select: { status: true, listingId: true, quantity: true },
        });
        if (request?.status !== 'accepted') return 'stale';
        const { count } = await tx.listingRequest.updateMany({
          where: { id, status: 'accepted' },
          data: { status: 'concluded' },
        });
        if (!count) return 'stale';
        if (request.quantity !== null) {
          const taken = await tx.listing.updateMany({
            where: { id: request.listingId, quantity: { gte: request.quantity } },
            data: { quantity: { decrement: request.quantity } },
          });
          // Quantité insuffisante : l'exception annule toute la transaction, la demande reste acceptée
          if (!taken.count) throw new InsufficientQuantity();
          await tx.listing.updateMany({
            where: { id: request.listingId, quantity: 0, status: 'published' },
            data: { status: 'sold' },
          });
        }
        await tx.listingRequestEvent.create({
          data: { requestId: id, status: 'concluded', actor: 'seller', createdAt: at },
          select: { id: true },
        });
        return toRecord(await tx.listingRequest.findUniqueOrThrow({ where: { id }, include }));
      })
      .catch((error: unknown) => {
        if (error instanceof InsufficientQuantity) return 'insufficient' as const;
        throw error;
      });
  },
};
