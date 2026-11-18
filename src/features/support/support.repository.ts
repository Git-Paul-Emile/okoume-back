import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketCategory = 'commande' | 'livraison' | 'retour' | 'produit' | 'compte' | 'publicite';

export interface TicketMessageRecord {
  id: string;
  author: 'customer' | 'support';
  /** Prénom et nom du membre de l'équipe, pour l'équipe seulement */
  staffName: string | null;
  body: string;
  attachments: string[];
  createdAt: Date;
}

export interface TicketRecord {
  id: string;
  number: string;
  customerId: string | null;
  email: string;
  name: string;
  category: TicketCategory;
  orderNumber: string | null;
  subject: string;
  status: TicketStatus;
  priority: 'normal' | 'high';
  satisfaction: number | null;
  assigneeId: string | null;
  closureReason: string | null;
  resolvedAt: Date | null;
  reopenedAt: Date | null;
  createdAt: Date;
  messages: TicketMessageRecord[];
}

export interface NewTicket {
  number: string;
  customerId: string | null;
  email: string;
  name: string;
  category: TicketCategory;
  orderNumber: string | null;
  subject: string;
  priority: 'normal' | 'high';
  message: { body: string; attachments: string[] };
}

export interface TicketChanges {
  status?: TicketStatus;
  priority?: 'normal' | 'high';
  assigneeId?: string | null;
  closureReason?: string | null;
  resolvedAt?: Date | null;
  reopenedAt?: Date;
  satisfaction?: number;
}

export interface StaffTicketFilters {
  status?: TicketStatus | undefined;
  priority?: 'normal' | 'high' | undefined;
  assigneeId?: string | undefined;
  search?: string | undefined;
  page: number;
  limit: number;
}

/** Contrat de stockage de l'assistance. */
export interface SupportRepository {
  /** null : ce numéro est déjà pris (tirage au hasard), à retenter avec un autre. */
  create(ticket: NewTicket): Promise<TicketRecord | null>;
  findByNumber(number: string): Promise<TicketRecord | null>;
  findById(id: string): Promise<TicketRecord | null>;
  listForCustomer(
    customerId: string,
    page: { page: number; limit: number },
  ): Promise<{ items: TicketRecord[]; total: number }>;
  listForStaff(filters: StaffTicketFilters): Promise<{ items: TicketRecord[]; total: number }>;
  /** Ajoute un message et applique les changements ensemble ; null si la demande n'existe plus. */
  addMessage(
    ticketId: string,
    message: { author: 'customer' | 'support'; staffId: string | null; body: string; attachments: string[] },
    changes: TicketChanges,
  ): Promise<TicketRecord | null>;
  update(ticketId: string, changes: TicketChanges): Promise<TicketRecord | null>;
  staffExists(staffId: string): Promise<boolean>;
}

const include = {
  messages: {
    orderBy: { createdAt: 'asc' as const },
    include: { staff: { select: { firstName: true, lastName: true } } },
  },
} satisfies Prisma.SupportTicketInclude;

type Row = Prisma.SupportTicketGetPayload<{ include: typeof include }>;

const toRecord = ({ messages, updatedAt: _u, ...t }: Row): TicketRecord => ({
  ...t,
  messages: messages.map((m) => ({
    id: m.id,
    author: m.author,
    staffName: m.staff ? `${m.staff.firstName} ${m.staff.lastName}` : null,
    body: m.body,
    attachments: m.attachments,
    createdAt: m.createdAt,
  })),
});

export const supportRepository: SupportRepository = {
  async create({ message, ...ticket }) {
    try {
      const row = await prisma.supportTicket.create({
        data: {
          ...ticket,
          messages: { create: { author: 'customer', body: message.body, attachments: message.attachments } },
        },
        include,
      });
      return toRecord(row);
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  async findByNumber(number) {
    const row = await prisma.supportTicket.findUnique({ where: { number }, include });
    return row ? toRecord(row) : null;
  },

  async findById(id) {
    const row = await prisma.supportTicket.findUnique({ where: { id }, include });
    return row ? toRecord(row) : null;
  },

  async listForCustomer(customerId, { page, limit }) {
    const where = { customerId };
    const [rows, total] = await prisma.$transaction([
      prisma.supportTicket.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  },

  async listForStaff({ status, priority, assigneeId, search, page, limit }) {
    const where: Prisma.SupportTicketWhereInput = {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { subject: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { orderNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      // Les demandes urgentes d'abord, puis les plus anciennes : l'ordre de traitement (15.3)
      prisma.supportTicket.findMany({
        where,
        include,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  },

  async addMessage(ticketId, message, changes) {
    return prisma.$transaction(async (tx) => {
      const exists = await tx.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true } });
      if (!exists) return null;
      await tx.supportMessage.create({ data: { ticketId, ...message }, select: { id: true } });
      return toRecord(await tx.supportTicket.update({ where: { id: ticketId }, data: changes, include }));
    });
  },

  async update(ticketId, changes) {
    const found = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true } });
    if (!found) return null;
    return toRecord(await prisma.supportTicket.update({ where: { id: ticketId }, data: changes, include }));
  },

  staffExists: async (staffId) =>
    !!(await prisma.staffMember.findUnique({ where: { id: staffId }, select: { id: true } })),
};
