import { randomUUID } from 'node:crypto';
import type { ChatRepository, ConversationRecord, MessageRecord } from '../src/features/chat/chat.repository.js';
import type { ListingsRepository } from '../src/features/listings/listings.repository.js';
import type { ShopsRepository } from '../src/features/shops/shops.repository.js';

type StoredConversation = Omit<ConversationRecord, 'listing' | 'shop'> & { listingId: string; shopId: string };
type StoredMessage = MessageRecord & { conversationId: string };

/**
 * Tchat en mémoire, même contrat que Prisma : une conversation par acheteur et par annonce, une seule réponse de
 * l'assistant par message de l'acheteur, message et effet sur la conversation écrits ensemble.
 */
export function createMemoryChat(store: { listings: ListingsRepository; shops: ShopsRepository }) {
  const conversations: StoredConversation[] = [];
  const messages: StoredMessage[] = [];

  async function toConversation({ listingId, shopId, ...c }: StoredConversation): Promise<ConversationRecord> {
    const listing = await store.listings.findById(listingId);
    const shop = await store.shops.findById(shopId);
    if (!listing || !shop) throw new Error('Annonce ou boutique absente');
    return {
      ...c,
      listing: { id: listing.id, slug: listing.slug, title: listing.title },
      shop: { id: shop.id, name: shop.name, ownerId: shop.ownerId },
    };
  }

  const toMessage = ({ conversationId: _c, ...m }: StoredMessage): MessageRecord => m;
  const ordered = (conversationId: string) => messages.filter((m) => m.conversationId === conversationId);

  const repository: ChatRepository = {
    async openOrGet(key, first, at) {
      const existing = conversations.find((c) => c.listingId === key.listingId && c.buyerId === key.buyerId);
      if (existing) return { conversation: await toConversation(existing), created: false };
      const conversation: StoredConversation = {
        id: randomUUID(),
        ...key,
        status: 'open',
        needsSeller: false,
        agreedPrice: null,
        agreementExpiresAt: null,
        lastMessageAt: at,
        createdAt: at,
      };
      conversations.push(conversation);
      messages.push({
        id: randomUUID(),
        conversationId: conversation.id,
        author: first.author,
        body: first.body,
        replyToId: null,
        model: null,
        createdAt: at,
      });
      return { conversation: await toConversation(conversation), created: true };
    },
    async findById(id) {
      const conversation = conversations.find((c) => c.id === id);
      return conversation ? toConversation(conversation) : null;
    },
    async list({ buyerId, shopId, needsSeller, page, limit }) {
      const found = conversations
        .filter((c) => (!buyerId || c.buyerId === buyerId) && (!shopId || c.shopId === shopId))
        .filter((c) => needsSeller === undefined || c.needsSeller === needsSeller)
        .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
      return {
        items: await Promise.all(found.slice((page - 1) * limit, page * limit).map(toConversation)),
        total: found.length,
      };
    },
    async messages(conversationId, { since, limit }) {
      return ordered(conversationId)
        .filter((m) => !since || m.createdAt > since)
        .slice(0, limit)
        .map(toMessage);
    },
    async recent(conversationId, limit) {
      return ordered(conversationId).slice(-limit).map(toMessage);
    },
    async addMessage(conversationId, message, at, patch = {}) {
      if (message.replyToId && messages.some((m) => m.replyToId === message.replyToId)) return 'duplicate';
      const stored: StoredMessage = {
        id: randomUUID(),
        conversationId,
        author: message.author,
        body: message.body,
        replyToId: message.replyToId ?? null,
        model: message.model ?? null,
        createdAt: at,
      };
      messages.push(stored);
      const conversation = conversations.find((c) => c.id === conversationId)!;
      conversation.lastMessageAt = at;
      if (patch.status) conversation.status = patch.status;
      if (patch.needsSeller !== undefined) conversation.needsSeller = patch.needsSeller;
      if (patch.agreement) {
        conversation.agreedPrice = patch.agreement.price;
        conversation.agreementExpiresAt = patch.agreement.expiresAt;
      }
      return toMessage(stored);
    },
    async buyerMessagesSince(buyerId, since) {
      const ids = new Set(conversations.filter((c) => c.buyerId === buyerId).map((c) => c.id));
      return messages.filter((m) => m.author === 'buyer' && ids.has(m.conversationId) && m.createdAt >= since).length;
    },
    async assistantRepliesSince(since) {
      return messages.filter((m) => m.author === 'assistant' && m.model !== null && m.createdAt >= since).length;
    },
    async validAgreement(listingId, buyerId, now) {
      const c = conversations.find((x) => x.listingId === listingId && x.buyerId === buyerId);
      return c?.agreedPrice != null && c.agreementExpiresAt && c.agreementExpiresAt > now ? c.agreedPrice : null;
    },
  };

  return { repository, conversations, messages };
}
