import { AppError, ConflictError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import type { JobQueue } from '../../infrastructure/queue/jobQueue.js';
import { logger } from '../../lib/logger.js';
import type { ListingsRepository } from '../listings/listings.repository.js';
import { publiclyVisible } from '../listings/listings.rules.js';
import type { Notifier } from '../notifications/notifier.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import type { ChatRepository, ConversationRecord, MessageRecord } from './chat.repository.js';
import { addHours, MESSAGES } from './chat.rules.js';
import type { ListConversationsQuery } from './chat.schemas.js';

/** Messages d'un acheteur sur 10 minutes, toutes conversations confondues : au-delà, il patiente (abus, coût). */
const BUYER_MESSAGE_LIMIT = 30;
const BUYER_WINDOW_MS = 10 * 60 * 1000;
const PAGE_OF_MESSAGES = 200;

export interface ChatDependencies {
  chat: ChatRepository;
  listings: ListingsRepository;
  shops: ShopsRepository;
  queue: JobQueue;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

const toMessageDto = (m: MessageRecord) => ({
  id: m.id,
  author: m.author,
  body: m.body,
  createdAt: m.createdAt.toISOString(),
});

/** Conversation vue par l'acheteur ou le vendeur : le prix convenu n'est montré que tant qu'il est valable. */
const toConversationDto = (c: ConversationRecord, now: Date, messages: MessageRecord[]) => {
  const valid = c.agreedPrice !== null && c.agreementExpiresAt !== null && c.agreementExpiresAt > now;
  return {
    id: c.id,
    listing: { slug: c.listing.slug, title: c.listing.title },
    shop: { name: c.shop.name },
    status: c.status,
    needsSeller: c.needsSeller,
    agreement: valid ? { price: c.agreedPrice, expiresAt: c.agreementExpiresAt?.toISOString() } : null,
    lastMessageAt: c.lastMessageAt.toISOString(),
    messages: messages.map(toMessageDto),
  };
};

/**
 * Tchat Okoumé (32.5), côté API : ouverture, messages, suivi, et interventions du vendeur. Les réponses de
 * l'assistant sont rédigées par le worker (job chat.reply), jamais pendant la requête de l'acheteur.
 */
export const createChatService = (deps: ChatDependencies) => {
  const { chat, listings, shops, queue, notifier, now } = deps;

  /** Une conversation d'un autre compte répond 404, comme une conversation inexistante (protection IDOR). */
  async function asBuyer(buyerId: string, id: string) {
    const conversation = await chat.findById(id);
    if (!conversation || conversation.buyerId !== buyerId) throw new NotFoundError('Conversation introuvable.');
    return conversation;
  }

  async function asSeller(customerId: string, id: string) {
    const conversation = await chat.findById(id);
    if (!conversation || conversation.shop.ownerId !== customerId) throw new NotFoundError('Conversation introuvable.');
    return conversation;
  }

  async function view(conversation: ConversationRecord, since?: Date) {
    const messages = await chat.messages(conversation.id, { since, limit: PAGE_OF_MESSAGES });
    return toConversationDto((await chat.findById(conversation.id)) ?? conversation, now(), messages);
  }

  /** Question transmise au vendeur, quand l'assistant ne peut pas être sollicité. */
  async function handToSeller(conversation: ConversationRecord, replyToId: string) {
    await chat.addMessage(
      conversation.id,
      { author: 'system', body: MESSAGES.assistantUnavailable, replyToId },
      now(),
      { needsSeller: true },
    );
    await notifier.notifyCustomer(conversation.shop.ownerId, 'shop', {
      title: 'Question d’un acheteur',
      body: conversation.listing.title,
      url: `${deps.appUrl}/vendeur/conversations/${conversation.id}`,
      tag: `tchat-${conversation.id}`,
    });
  }

  return {
    /** Ouverture depuis une annonce publiée ; le premier message avertit l'acheteur qu'il parle à une IA. */
    async open(buyerId: string, listingSlug: string) {
      const listing = await listings.findBySlug(listingSlug);
      const { graceDays } = await shops.settings();
      if (!listing || !publiclyVisible(listing, now(), graceDays)) throw new NotFoundError('Annonce introuvable.');
      if (listing.shop.ownerId === buyerId)
        throw new UnprocessableError('Vous ne pouvez pas ouvrir le tchat de votre propre annonce.');
      const { conversation, created } = await chat.openOrGet(
        { listingId: listing.id, shopId: listing.shop.id, buyerId },
        { author: 'system', body: MESSAGES.disclosure },
        now(),
      );
      return { created, conversation: await view(conversation) };
    },

    async list(buyerId: string, query: ListConversationsQuery) {
      const { items, total } = await chat.list({ buyerId, page: query.page, limit: query.limit });
      return paginate(
        items.map((c) => toConversationDto(c, now(), [])),
        total,
        query.page,
        query.limit,
      );
    },

    async get(buyerId: string, id: string, since?: Date) {
      return view(await asBuyer(buyerId, id), since);
    },

    /**
     * Message de l'acheteur : il rouvre une conversation close, puis sa réponse est déposée dans la file. Si le
     * dépôt échoue, la question va au vendeur plutôt que de rester sans réponse.
     */
    async send(buyerId: string, id: string, body: string) {
      const conversation = await asBuyer(buyerId, id);
      const listing = await listings.findById(conversation.listing.id);
      const { graceDays } = await shops.settings();
      if (!listing || !publiclyVisible(listing, now(), graceDays))
        throw new ConflictError('Cette annonce n’est plus disponible : le tchat est fermé.');
      if ((await chat.buyerMessagesSince(buyerId, new Date(now().getTime() - BUYER_WINDOW_MS))) >= BUYER_MESSAGE_LIMIT)
        throw new AppError('Trop de messages en peu de temps : patientez quelques minutes.', 429, 'CHAT_RATE_LIMITED');
      const message = await chat.addMessage(conversation.id, { author: 'buyer', body }, now(), { status: 'open' });
      if (message === 'duplicate') throw new Error('Message de l’acheteur en double');
      try {
        await queue.send('chat.reply', { conversationId: conversation.id, messageId: message.id });
      } catch (err) {
        logger.error({ err, conversationId: conversation.id }, 'Réponse du tchat non déposée');
        await handToSeller(conversation, message.id);
      }
      return toMessageDto(message);
    },

    async close(buyerId: string, id: string) {
      const conversation = await asBuyer(buyerId, id);
      if (conversation.status === 'open')
        await chat.addMessage(conversation.id, { author: 'system', body: MESSAGES.closing }, now(), {
          status: 'closed',
        });
      return view(conversation);
    },

    async sellerList(customerId: string, query: ListConversationsQuery) {
      const shop = await shops.findByOwner(customerId);
      if (!shop) throw new NotFoundError('Ouvrez d’abord votre boutique.');
      const { items, total } = await chat.list({
        shopId: shop.id,
        needsSeller: query.needsSeller,
        page: query.page,
        limit: query.limit,
      });
      return paginate(
        items.map((c) => toConversationDto(c, now(), [])),
        total,
        query.page,
        query.limit,
      );
    },

    async sellerGet(customerId: string, id: string, since?: Date) {
      return view(await asSeller(customerId, id), since);
    },

    /** Réponse du vendeur : la question en attente est traitée, l'acheteur est prévenu. */
    async sellerSend(customerId: string, id: string, body: string) {
      const conversation = await asSeller(customerId, id);
      const message = await chat.addMessage(conversation.id, { author: 'seller', body }, now(), { needsSeller: false });
      if (message === 'duplicate') throw new Error('Message du vendeur en double');
      await notifier.notifyCustomer(conversation.buyerId, 'orders', {
        title: `Réponse de ${conversation.shop.name}`,
        body: conversation.listing.title,
        url: `${deps.appUrl}/compte/conversations/${conversation.id}`,
        tag: `tchat-${conversation.id}`,
      });
      return toMessageDto(message);
    },

    /**
     * Prix proposé par le vendeur lui-même : c'est sa décision, le prix minimum ne s'applique pas. Au plus le prix
     * affiché, valable le temps réglé par l'administration.
     */
    async sellerAgreement(customerId: string, id: string, price: number) {
      const conversation = await asSeller(customerId, id);
      const listing = await listings.findById(conversation.listing.id);
      if (!listing) throw new NotFoundError('Annonce introuvable.');
      if (price > listing.price) throw new UnprocessableError('Le prix proposé dépasse le prix affiché.');
      const { agreementValidityHours } = await shops.settings();
      const expiresAt = addHours(now(), agreementValidityHours);
      await chat.addMessage(
        conversation.id,
        { author: 'system', body: MESSAGES.sellerAgreement(price, expiresAt) },
        now(),
        { agreement: { price, expiresAt }, needsSeller: false },
      );
      await notifier.notifyCustomer(conversation.buyerId, 'orders', {
        title: `Prix proposé par ${conversation.shop.name}`,
        body: conversation.listing.title,
        url: `${deps.appUrl}/compte/conversations/${conversation.id}`,
        tag: `tchat-${conversation.id}`,
      });
      return view(conversation);
    },
  };
};

export type ChatService = ReturnType<typeof createChatService>;
