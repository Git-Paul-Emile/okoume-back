import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

/** Échanges ouverts qui empêchent l'anonymisation automatique du compte. */
export interface DeletionBlockers {
  orders: string[];
  returns: string[];
  listingRequests: string[];
  shop: boolean;
}

export const hasBlockers = (blockers: DeletionBlockers) =>
  blockers.orders.length + blockers.returns.length + blockers.listingRequests.length > 0 || blockers.shop;

/** Conservation et anonymisation automatique; aucune demande client de correction n'est gérée ici. */
export interface PrivacyRepository {
  /** Renvoie les blocages, ou null lorsque le compte a été anonymisé. */
  anonymize(customerId: string, at: Date): Promise<DeletionBlockers | null>;
  inactiveCustomers(before: Date, limit: number): Promise<string[]>;
}

const ANONYMOUS_NAME = 'Client supprimé';
const anonymousEmail = (customerId: string) => `supprime-${customerId}@anonyme.invalid`;

const OPEN_ORDER: Prisma.OrderWhereInput = {
  OR: [{ status: { notIn: ['delivered', 'cancelled'] } }, { paymentStatus: 'refund_due' }],
};
const OPEN_RETURN = { status: { notIn: ['refused', 'refunded', 'closed'] } } satisfies Prisma.ReturnRequestWhereInput;
const OPEN_LISTING_REQUEST = { status: { in: ['sent', 'accepted'] } } satisfies Prisma.ListingRequestWhereInput;

async function findBlockers(db: Prisma.TransactionClient, customerId: string): Promise<DeletionBlockers> {
  const [orders, returns, listingRequests, shop] = await Promise.all([
    db.order.findMany({
      where: { customerId, ...OPEN_ORDER },
      select: { number: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.returnRequest.findMany({
      where: { order: { customerId }, ...OPEN_RETURN },
      select: { order: { select: { number: true } } },
    }),
    db.listingRequest.findMany({ where: { buyerId: customerId, ...OPEN_LISTING_REQUEST }, select: { number: true } }),
    db.shop.findUnique({ where: { ownerId: customerId }, select: { id: true } }),
  ]);
  return {
    orders: orders.map((order) => order.number),
    returns: returns.map((request) => request.order.number),
    listingRequests: listingRequests.map((request) => request.number),
    shop: shop !== null,
  };
}

export const privacyRepository: PrivacyRepository = {
  anonymize: (customerId, at) =>
    prisma.$transaction(async (tx) => {
      const blockers = await findBlockers(tx, customerId);
      if (hasBlockers(blockers)) return blockers;
      await tx.customer.update({
        where: { id: customerId },
        data: {
          email: anonymousEmail(customerId),
          phone: null,
          phoneKey: null,
          passwordHash: '',
          firstName: 'Client',
          lastName: 'supprimé',
          birthDate: null,
          notificationPrefs: {},
          status: 'anonymized',
          anonymizedAt: at,
        },
      });
      await tx.session.deleteMany({ where: { customerId } });
      await tx.pushSubscription.deleteMany({ where: { customerId } });
      await tx.verificationCode.deleteMany({ where: { subjectId: customerId } });
      await tx.customerAddress.deleteMany({ where: { customerId } });
      await tx.customerFavorite.deleteMany({ where: { customerId } });
      // Les commandes et avis restent utiles à la comptabilité et aux statistiques sans identifier le client.
      await tx.order.updateMany({
        where: { customerId },
        data: { recipient: ANONYMOUS_NAME, phone: '', email: '', landmark: '', instructions: '' },
      });
      await tx.supportTicket.updateMany({ where: { customerId }, data: { name: ANONYMOUS_NAME, email: '' } });
      await tx.listingRequest.updateMany({ where: { buyerId: customerId }, data: { contactPhone: '', message: '' } });
      // Nettoie aussi les éventuelles demandes historiques, sans en créer de nouvelles ni les rendre consultables.
      await tx.privacyRequest.updateMany({ where: { customerId }, data: { name: ANONYMOUS_NAME, email: '' } });
      await tx.productReview.updateMany({ where: { customerId }, data: { authorName: 'Client' } });
      await tx.reviewReport.deleteMany({ where: { customerId } });
      return null;
    }),

  inactiveCustomers: async (before, limit) =>
    (
      await prisma.customer.findMany({
        where: {
          status: { not: 'anonymized' },
          OR: [{ lastLoginAt: { lt: before } }, { lastLoginAt: null, createdAt: { lt: before } }],
          orders: { none: { createdAt: { gte: before } } },
          shop: null,
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: limit,
      })
    ).map((customer) => customer.id),
};
