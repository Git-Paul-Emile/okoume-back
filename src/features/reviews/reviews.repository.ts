import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** Type et non interface : une étape doit pouvoir s'enregistrer telle quelle en JSON. */
export type ReviewEvent = { at: string; event: string; rating?: number; comment?: string };

export interface ReviewRecord {
  id: string;
  productId: string;
  productName: string;
  customerId: string | null;
  authorName: string;
  rating: number;
  comment: string;
  photos: string[];
  status: ReviewStatus;
  rejectionReason: string | null;
  history: ReviewEvent[];
  createdAt: Date;
}

export interface ReviewContent {
  rating: number;
  comment: string;
  photos: string[];
}

export interface RatingRecord {
  productId: string;
  average: number;
  count: number;
}

export interface StaffReviewFilters {
  status?: ReviewStatus | undefined;
  page: number;
  limit: number;
}

/** Contrat de stockage des avis. */
export interface ReviewsRepository {
  findById(id: string): Promise<ReviewRecord | null>;
  findMine(customerId: string, productId: string): Promise<ReviewRecord | null>;
  /** Avis publiés d'un produit, les plus récents d'abord */
  listApproved(
    productId: string,
    page: { page: number; limit: number },
  ): Promise<{ items: ReviewRecord[]; total: number }>;
  ratings(): Promise<RatingRecord[]>;
  /** Le client a reçu ce produit (commande livrée) : seul un achat vérifié ouvre le droit à un avis. */
  hasReceived(customerId: string, productId: string): Promise<boolean>;
  /** Dépôt ou modification : l'avis repasse en modération, la version précédente rejoint l'historique. */
  save(
    customerId: string,
    productId: string,
    authorName: string,
    content: ReviewContent,
    event: ReviewEvent,
  ): Promise<ReviewRecord>;
  list(filters: StaffReviewFilters): Promise<{ items: ReviewRecord[]; total: number }>;
  /** Décision de l'équipe : les signalements de l'avis sont clos avec elle. */
  decide(
    id: string,
    decision: { status: 'approved' | 'rejected'; rejectionReason: string | null },
    event: ReviewEvent,
  ): Promise<ReviewRecord | null>;
  staffName(id: string): Promise<string | null>;
}

const historyDto = z.array(
  z.object({ at: z.string(), event: z.string(), rating: z.number().optional(), comment: z.string().optional() }),
);

const include = {
  product: { select: { name: true } },
} satisfies Prisma.ProductReviewInclude;
type Row = Prisma.ProductReviewGetPayload<{ include: typeof include }>;

const toRecord = (r: Row): ReviewRecord => ({
  id: r.id,
  productId: r.productId,
  productName: r.product.name,
  customerId: r.customerId,
  authorName: r.authorName,
  rating: r.rating,
  comment: r.comment,
  photos: r.photos,
  status: r.status,
  rejectionReason: r.rejectionReason,
  // Écrit uniquement par ce dépôt : une forme inattendue est une erreur à signaler, pas à masquer
  history: historyDto.parse(r.history),
  createdAt: r.createdAt,
});

export const reviewsRepository: ReviewsRepository = {
  findById: async (id) => {
    const row = await prisma.productReview.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  },

  findMine: async (customerId, productId) => {
    const row = await prisma.productReview.findUnique({
      where: { productId_customerId: { productId, customerId } },
      include,
    });
    return row ? toRecord(row) : null;
  },

  async listApproved(productId, { page, limit }) {
    const where = { productId, status: 'approved' } satisfies Prisma.ProductReviewWhereInput;
    const [rows, total] = await prisma.$transaction([
      prisma.productReview.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.productReview.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  },

  async ratings() {
    const groups = await prisma.productReview.groupBy({
      by: ['productId'],
      where: { status: 'approved', product: { status: 'published' } },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return groups.map((g) => ({ productId: g.productId, average: g._avg.rating ?? 0, count: g._count._all }));
  },

  hasReceived: async (customerId, productId) =>
    (await prisma.order.count({
      where: { customerId, status: 'delivered', items: { some: { productId } } },
    })) > 0,

  save: (customerId, productId, authorName, content, event) =>
    prisma.$transaction(async (tx) => {
      const current = await tx.productReview.findUnique({
        where: { productId_customerId: { productId, customerId } },
      });
      if (!current)
        return toRecord(
          await tx.productReview.create({
            data: { productId, customerId, authorName, ...content, history: [event] },
            include,
          }),
        );
      const previous: ReviewEvent = {
        at: event.at,
        event: 'Avis modifié par le client',
        rating: current.rating,
        comment: current.comment,
      };
      return toRecord(
        await tx.productReview.update({
          where: { id: current.id },
          data: {
            ...content,
            authorName,
            status: 'pending',
            rejectionReason: null,
            history: [...historyDto.parse(current.history), previous],
          },
          include,
        }),
      );
    }),

  async list({ status, page, limit }) {
    const where: Prisma.ProductReviewWhereInput = {
      ...(status ? { status } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.productReview.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.productReview.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  },

  decide: (id, decision, event) =>
    prisma.$transaction(async (tx) => {
      const current = await tx.productReview.findUnique({ where: { id }, select: { history: true } });
      if (!current) return null;
      return toRecord(
        await tx.productReview.update({
          where: { id },
          data: { ...decision, history: [...historyDto.parse(current.history), event] },
          include,
        }),
      );
    }),

  staffName: async (id) => {
    const member = await prisma.staffMember.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
    return member ? `${member.firstName} ${member.lastName}` : null;
  },
};
