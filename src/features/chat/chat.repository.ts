import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export type ChatAuthor = 'buyer' | 'assistant' | 'seller' | 'system';

export interface ConversationRecord {
  id: string;
  listing: { id: string; slug: string; title: string };
  shop: { id: string; name: string; ownerId: string };
  buyerId: string;
  status: 'open' | 'closed';
  needsSeller: boolean;
  agreedPrice: number | null;
  agreementExpiresAt: Date | null;
  lastMessageAt: Date;
  createdAt: Date;
}

export interface MessageRecord {
  id: string;
  author: ChatAuthor;
  body: string;
  replyToId: string | null;
  model: string | null;
  createdAt: Date;
}

export interface NewMessage {
  author: ChatAuthor;
  body: string;
  /** Message de l'acheteur auquel l'assistant répond : une seule réponse par message */
  replyToId?: string | undefined;
  model?: string | null | undefined;
}

/** Effet du message sur la conversation, écrit dans la même transaction. */
export interface ConversationPatch {
  status?: 'open' | 'closed';
  needsSeller?: boolean;
  agreement?: { price: number; expiresAt: Date };
}

/** Contrat du tchat Okoumé (32.5) : conversations, messages, prix convenus. */
export interface ChatRepository {
  /** Conversation de l'acheteur sur l'annonce, créée au besoin avec son premier message (avertissement IA). */
  openOrGet(
    key: { listingId: string; shopId: string; buyerId: string },
    first: NewMessage,
    at: Date,
  ): Promise<{ conversation: ConversationRecord; created: boolean }>;
  findById(id: string): Promise<ConversationRecord | null>;
  list(query: {
    buyerId?: string | undefined;
    shopId?: string | undefined;
    needsSeller?: boolean | undefined;
    page: number;
    limit: number;
  }): Promise<{ items: ConversationRecord[]; total: number }>;
  /** Messages du plus ancien au plus récent ; avec since, seulement ceux écrits après cette date. */
  messages(conversationId: string, query: { since?: Date | undefined; limit: number }): Promise<MessageRecord[]>;
  /** Derniers messages, du plus ancien au plus récent, pour le contexte de l'assistant. */
  recent(conversationId: string, limit: number): Promise<MessageRecord[]>;
  /** « duplicate » : l'assistant a déjà répondu à ce message (job rejoué), rien n'est écrit. */
  addMessage(
    conversationId: string,
    message: NewMessage,
    at: Date,
    patch?: ConversationPatch,
  ): Promise<MessageRecord | 'duplicate'>;
  buyerMessagesSince(buyerId: string, since: Date): Promise<number>;
  /** Réponses rédigées par un modèle depuis cette date, pour le plafond mensuel (16.6). */
  assistantRepliesSince(since: Date): Promise<number>;
  /** Prix convenu encore valable entre cet acheteur et cette annonce, ou null. */
  validAgreement(listingId: string, buyerId: string, now: Date): Promise<number | null>;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const include = {
  listing: { select: { id: true, slug: true, title: true } },
  shop: { select: { id: true, name: true, ownerId: true } },
} as const satisfies Prisma.ConversationInclude;
type Row = Prisma.ConversationGetPayload<{ include: typeof include }>;

const toConversation = (row: Row): ConversationRecord => ({
  id: row.id,
  listing: row.listing,
  shop: row.shop,
  buyerId: row.buyerId,
  status: row.status,
  needsSeller: row.needsSeller,
  agreedPrice: row.agreedPrice?.toNumber() ?? null,
  agreementExpiresAt: row.agreementExpiresAt,
  lastMessageAt: row.lastMessageAt,
  createdAt: row.createdAt,
});

const messageColumns = {
  id: true,
  author: true,
  body: true,
  replyToId: true,
  model: true,
  createdAt: true,
} as const satisfies Prisma.ChatMessageSelect;

const patchData = (patch: ConversationPatch, at: Date): Prisma.ConversationUpdateInput => ({
  lastMessageAt: at,
  ...(patch.status ? { status: patch.status } : {}),
  ...(patch.needsSeller !== undefined ? { needsSeller: patch.needsSeller } : {}),
  ...(patch.agreement ? { agreedPrice: patch.agreement.price, agreementExpiresAt: patch.agreement.expiresAt } : {}),
});

export const chatRepository: ChatRepository = {
  async openOrGet(key, first, at) {
    const existing = await prisma.conversation.findUnique({
      where: { listingId_buyerId: { listingId: key.listingId, buyerId: key.buyerId } },
      include,
    });
    if (existing) return { conversation: toConversation(existing), created: false };
    try {
      const row = await prisma.conversation.create({
        data: { ...key, lastMessageAt: at, createdAt: at, messages: { create: { ...first, createdAt: at } } },
        include,
      });
      return { conversation: toConversation(row), created: true };
    } catch (error) {
      // Deux ouvertures simultanées : la contrainte unique a tranché, la conversation existe
      if (!isUniqueViolation(error)) throw error;
      const row = await prisma.conversation.findUniqueOrThrow({
        where: { listingId_buyerId: { listingId: key.listingId, buyerId: key.buyerId } },
        include,
      });
      return { conversation: toConversation(row), created: false };
    }
  },

  async findById(id) {
    const row = await prisma.conversation.findUnique({ where: { id }, include });
    return row ? toConversation(row) : null;
  },

  async list({ buyerId, shopId, needsSeller, page, limit }) {
    const where: Prisma.ConversationWhereInput = {
      ...(buyerId ? { buyerId } : {}),
      ...(shopId ? { shopId } : {}),
      ...(needsSeller !== undefined ? { needsSeller } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.conversation.findMany({
        where,
        include,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.conversation.count({ where }),
    ]);
    return { items: rows.map(toConversation), total };
  },

  messages: (conversationId, { since, limit }) =>
    prisma.chatMessage.findMany({
      where: { conversationId, ...(since ? { createdAt: { gt: since } } : {}) },
      select: messageColumns,
      orderBy: { createdAt: 'asc' },
      take: limit,
    }),

  async recent(conversationId, limit) {
    const rows = await prisma.chatMessage.findMany({
      where: { conversationId },
      select: messageColumns,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse();
  },

  async addMessage(conversationId, message, at, patch = {}) {
    try {
      return await prisma.$transaction(async (tx) => {
        const created = await tx.chatMessage.create({
          data: {
            conversationId,
            author: message.author,
            body: message.body,
            replyToId: message.replyToId ?? null,
            model: message.model ?? null,
            createdAt: at,
          },
          select: messageColumns,
        });
        await tx.conversation.update({
          where: { id: conversationId },
          data: patchData(patch, at),
          select: { id: true },
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return 'duplicate';
      throw error;
    }
  },

  buyerMessagesSince: (buyerId, since) =>
    prisma.chatMessage.count({ where: { author: 'buyer', createdAt: { gte: since }, conversation: { buyerId } } }),

  assistantRepliesSince: (since) =>
    prisma.chatMessage.count({ where: { author: 'assistant', model: { not: null }, createdAt: { gte: since } } }),

  async validAgreement(listingId, buyerId, now) {
    const row = await prisma.conversation.findUnique({
      where: { listingId_buyerId: { listingId, buyerId } },
      select: { agreedPrice: true, agreementExpiresAt: true },
    });
    return row?.agreedPrice && row.agreementExpiresAt && row.agreementExpiresAt > now
      ? row.agreedPrice.toNumber()
      : null;
  },
};
