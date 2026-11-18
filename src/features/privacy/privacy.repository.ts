import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export type PrivacyRequestType = 'access' | 'export' | 'correction' | 'deletion';
export type PrivacyRequestStatus = 'received' | 'in_progress' | 'completed' | 'refused';

/** Type et non interface : une étape doit pouvoir s’enregistrer telle quelle en JSON. */
export type PrivacyEvent = {
  at: string;
  by: string;
  event: string;
};

export interface PrivacyRequestRecord {
  id: string;
  number: string;
  customerId: string | null;
  name: string;
  email: string;
  type: PrivacyRequestType;
  details: string;
  status: PrivacyRequestStatus;
  response: string | null;
  history: PrivacyEvent[];
  dueAt: Date;
  createdAt: Date;
}

export type NewPrivacyRequest = Omit<PrivacyRequestRecord, 'id' | 'createdAt'>;

export interface PrivacyRequestChanges {
  status?: PrivacyRequestStatus;
  response?: string;
}

export interface PrivacyFilters {
  /** open : reçues ou en cours */
  status?: PrivacyRequestStatus | 'open' | undefined;
  page: number;
  limit: number;
}

/** Ce qui empêche d'anonymiser un compte : la personne doit rester joignable tant qu'un échange est en cours. */
export interface DeletionBlockers {
  orders: string[];
  returns: string[];
  listingRequests: string[];
  shop: boolean;
}

export const hasBlockers = (b: DeletionBlockers) =>
  b.orders.length + b.returns.length + b.listingRequests.length > 0 || b.shop;

/** Copie des données d'un client (19.5) : tout ce que la boutique détient sur lui, sous une forme lisible. */
export interface CustomerDataExport {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    birthDate: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    referralCode: string;
    notificationPrefs: unknown;
  };
  addresses: Array<{
    label: string;
    recipient: string;
    phone: string;
    zone: string;
    landmark: string;
    instructions: string;
  }>;
  orders: Array<{
    number: string;
    createdAt: string;
    status: string;
    paymentMethod: string;
    total: number;
    delivery: { recipient: string; phone: string; email: string; zone: string; landmark: string; instructions: string };
    items: Array<{ name: string; variant: string; quantity: number; unitPrice: number }>;
  }>;
  loyaltyMovements: Array<{ type: string; points: number; label: string; createdAt: string }>;
  supportRequests: Array<{
    number: string;
    subject: string;
    status: string;
    createdAt: string;
    messages: Array<{ from: string; body: string; at: string }>;
  }>;
  listingRequests: Array<{ number: string; listing: string; total: number; status: string; createdAt: string }>;
  favorites: string[];
  reviews: Array<{ product: string; rating: number; comment: string; status: string; createdAt: string }>;
  privacyRequests: Array<{ number: string; type: string; status: string; createdAt: string }>;
}

/** Contrat de stockage des demandes sur les données personnelles et de l'anonymisation. */
export interface PrivacyRepository {
  /** null : ce numéro est déjà pris (tirage au hasard), à retenter avec un autre. */
  create(request: NewPrivacyRequest): Promise<PrivacyRequestRecord | null>;
  findById(id: string): Promise<PrivacyRequestRecord | null>;
  listForCustomer(customerId: string): Promise<PrivacyRequestRecord[]>;
  list(filters: PrivacyFilters): Promise<{ items: PrivacyRequestRecord[]; total: number }>;
  /** Ajoute l'étape à l'historique ; null si la demande n'existe plus. */
  update(id: string, changes: PrivacyRequestChanges, event: PrivacyEvent): Promise<PrivacyRequestRecord | null>;
  blockers(customerId: string): Promise<DeletionBlockers>;
  /**
   * Anonymise le compte et ses données en une transaction, après avoir revérifié les blocages dans cette
   * même transaction. Rend les blocages trouvés, ou null une fois le compte anonymisé.
   */
  anonymize(customerId: string, at: Date): Promise<DeletionBlockers | null>;
  exportData(customerId: string): Promise<CustomerDataExport | null>;
  /** Comptes sans connexion ni commande depuis `before`, jamais anonymisés, sans boutique. */
  inactiveCustomers(before: Date, limit: number): Promise<string[]>;
  staffName(id: string): Promise<string | null>;
}

/** Nom et coordonnées laissés à la place des vrais après l'anonymisation. */
export const ANONYMOUS_NAME = 'Client supprimé';
export const anonymousEmail = (customerId: string) => `supprime-${customerId}@anonyme.invalid`;

const OPEN_ORDER: Prisma.OrderWhereInput = {
  OR: [{ status: { notIn: ['delivered', 'cancelled'] } }, { paymentStatus: 'refund_due' }],
};
const OPEN_RETURN = { status: { notIn: ['refused', 'refunded', 'closed'] } } satisfies Prisma.ReturnRequestWhereInput;
const OPEN_LISTING_REQUEST = { status: { in: ['sent', 'accepted'] } } satisfies Prisma.ListingRequestWhereInput;

const historyDto = z.array(z.object({ at: z.string(), by: z.string(), event: z.string() }));

type Row = Prisma.PrivacyRequestGetPayload<object>;
const toRecord = (r: Row): PrivacyRequestRecord => ({
  id: r.id,
  number: r.number,
  customerId: r.customerId,
  name: r.name,
  email: r.email,
  type: r.type,
  details: r.details,
  status: r.status,
  response: r.response,
  // Écrit uniquement par ce dépôt : une forme inattendue est une erreur à signaler, pas à masquer
  history: historyDto.parse(r.history),
  dueAt: r.dueAt,
  createdAt: r.createdAt,
});

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
    orders: orders.map((o) => o.number),
    returns: returns.map((r) => r.order.number),
    listingRequests: listingRequests.map((r) => r.number),
    shop: shop !== null,
  };
}

const num = (value: Prisma.Decimal) => value.toNumber();

export const privacyRepository: PrivacyRepository = {
  async create({ history, ...request }) {
    try {
      return toRecord(await prisma.privacyRequest.create({ data: { ...request, history: [...history] } }));
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  findById: async (id) => {
    const row = await prisma.privacyRequest.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  listForCustomer: async (customerId) =>
    (await prisma.privacyRequest.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 100 })).map(
      toRecord,
    ),

  async list({ status, page, limit }) {
    const where: Prisma.PrivacyRequestWhereInput =
      status === 'open' ? { status: { in: ['received', 'in_progress'] } } : status ? { status } : {};
    const [rows, total] = await prisma.$transaction([
      // Les plus urgentes d'abord : échéance la plus proche
      prisma.privacyRequest.findMany({
        where,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.privacyRequest.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  },

  update: (id, changes, event) =>
    prisma.$transaction(async (tx) => {
      const current = await tx.privacyRequest.findUnique({ where: { id }, select: { history: true } });
      if (!current) return null;
      const history = [...historyDto.parse(current.history), event];
      return toRecord(await tx.privacyRequest.update({ where: { id }, data: { ...changes, history } }));
    }),

  blockers: (customerId) => findBlockers(prisma, customerId),

  anonymize: (customerId, at) =>
    prisma.$transaction(async (tx) => {
      const blockers = await findBlockers(tx, customerId);
      if (hasBlockers(blockers)) return blockers;
      const email = anonymousEmail(customerId);
      await tx.customer.update({
        where: { id: customerId },
        data: {
          email,
          phone: null,
          phoneKey: null,
          // Empreinte illisible : aucun mot de passe ne correspond plus
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
      // Les montants restent pour la comptabilité, sans nom, téléphone, e-mail ni adresse
      await tx.order.updateMany({
        where: { customerId },
        data: { recipient: ANONYMOUS_NAME, phone: '', email: '', landmark: '', instructions: '' },
      });
      await tx.supportTicket.updateMany({ where: { customerId }, data: { name: ANONYMOUS_NAME, email: '' } });
      await tx.listingRequest.updateMany({ where: { buyerId: customerId }, data: { contactPhone: '', message: '' } });
      await tx.privacyRequest.updateMany({ where: { customerId }, data: { name: ANONYMOUS_NAME, email: '' } });
      await tx.productReview.updateMany({ where: { customerId }, data: { authorName: 'Client' } });
      await tx.reviewReport.deleteMany({ where: { customerId } });
      return null;
    }),

  async exportData(customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        addresses: { include: { zone: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
        orders: { include: { items: true }, orderBy: { createdAt: 'desc' } },
        loyaltyMovements: { orderBy: { createdAt: 'desc' } },
        supportTickets: { include: { messages: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } },
        listingRequests: { orderBy: { createdAt: 'desc' } },
        favorites: { include: { product: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
        privacyRequests: { orderBy: { createdAt: 'desc' } },
        reviews: { include: { product: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!customer || customer.status === 'anonymized') return null;
    return {
      profile: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        birthDate: customer.birthDate?.toISOString().slice(0, 10) ?? null,
        createdAt: customer.createdAt.toISOString(),
        lastLoginAt: customer.lastLoginAt?.toISOString() ?? null,
        referralCode: customer.referralCode,
        notificationPrefs: customer.notificationPrefs,
      },
      addresses: customer.addresses.map((a) => ({
        label: a.label,
        recipient: a.recipient,
        phone: a.phone,
        zone: a.zone.name,
        landmark: a.landmark,
        instructions: a.instructions,
      })),
      orders: customer.orders.map((o) => ({
        number: o.number,
        createdAt: o.createdAt.toISOString(),
        status: o.status,
        paymentMethod: o.paymentMethod,
        total: num(o.total),
        delivery: {
          recipient: o.recipient,
          phone: o.phone,
          email: o.email,
          zone: o.zoneName,
          landmark: o.landmark,
          instructions: o.instructions,
        },
        items: o.items.map((i) => ({
          name: i.name,
          variant: i.variantLabel,
          quantity: i.quantity,
          unitPrice: num(i.unitPrice),
        })),
      })),
      loyaltyMovements: customer.loyaltyMovements.map((m) => ({
        type: m.type,
        points: m.points,
        label: m.label,
        createdAt: m.createdAt.toISOString(),
      })),
      supportRequests: customer.supportTickets.map((t) => ({
        number: t.number,
        subject: t.subject,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        messages: t.messages.map((m) => ({ from: m.author, body: m.body, at: m.createdAt.toISOString() })),
      })),
      listingRequests: customer.listingRequests.map((r) => ({
        number: r.number,
        listing: r.listingTitle,
        total: num(r.total),
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      favorites: customer.favorites.map((f) => f.product.name),
      reviews: customer.reviews.map((r) => ({
        product: r.product.name,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      privacyRequests: customer.privacyRequests.map((r) => ({
        number: r.number,
        type: r.type,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },

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
    ).map((c) => c.id),

  staffName: async (id) => {
    const member = await prisma.staffMember.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
    return member ? `${member.firstName} ${member.lastName}` : null;
  },
};
