import type { ChatAssistant, ChatTurn } from '../../infrastructure/ai/chatAssistant.js';
import type { ListingsRepository, ListingRecord } from '../listings/listings.repository.js';
import { startOfMonth } from '../listings/listings.rules.js';
import type { Notifier } from '../notifications/notifier.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import type { ChatRepository, ConversationPatch, ConversationRecord } from './chat.repository.js';
import { addHours, decideOffer, MESSAGES, mentionsLowerPrice } from './chat.rules.js';

/** Messages récents donnés à l'assistant : assez pour le fil, sans faire grossir le coût de chaque réponse. */
const TRANSCRIPT_LENGTH = 20;

export interface ChatReplyDependencies {
  chat: ChatRepository;
  listings: ListingsRepository;
  shops: ShopsRepository;
  assistant: ChatAssistant;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

/**
 * Réponses du tchat (32.5), exécutées par le worker. L'assistant comprend et rédige ; le serveur décide : il
 * accepte ou refuse les prix sans jamais transmettre le prix minimum au modèle, et remplace toute réponse qui
 * citerait un prix inférieur au prix affiché.
 */
export const createChatReplyWorker = (deps: ChatReplyDependencies) => {
  const { chat, listings, shops, assistant, notifier, now } = deps;

  async function notifySeller(conversation: ConversationRecord) {
    await notifier.notifyCustomer(conversation.shop.ownerId, 'shop', {
      title: 'Question d’un acheteur',
      body: conversation.listing.title,
      url: `${deps.appUrl}/vendeur/conversations/${conversation.id}`,
      tag: `tchat-${conversation.id}`,
    });
  }

  /** Message rédigé par le serveur ou l'assistant, et son effet sur la conversation. */
  async function decide(turn: ChatTurn, listing: ListingRecord) {
    const handoff = { body: MESSAGES.handedToSeller, patch: { needsSeller: true } satisfies ConversationPatch };
    const agreement = async (price: number) => {
      const { agreementValidityHours } = await shops.settings();
      const expiresAt = addHours(now(), agreementValidityHours);
      return { body: MESSAGES.offerAccepted(price, expiresAt), patch: { agreement: { price, expiresAt } } };
    };
    switch (turn.intent) {
      case 'answer':
        // Réponse vide, ou qui parlerait d'un prix plus bas : rien n'est envoyé tel quel, le vendeur répond
        return !turn.reply.trim() || mentionsLowerPrice(turn.reply, listing.price)
          ? handoff
          : { body: turn.reply.trim(), patch: {} };
      case 'offer': {
        if (turn.buyerOffer === null || turn.buyerOffer <= 0) return handoff;
        const decision = decideOffer(turn.buyerOffer, listing.minPrice, listing.price);
        return decision.accepted ? agreement(decision.price) : { body: MESSAGES.offerDeclined, patch: {} };
      }
      case 'accept_price':
        return agreement(listing.price);
      case 'needs_seller':
        return handoff;
      case 'no_more_questions':
        return { body: MESSAGES.closing, patch: { status: 'closed' } satisfies ConversationPatch };
    }
  }

  async function answer(
    conversation: ConversationRecord,
    messageId: string,
    reply: { body: string; patch: ConversationPatch },
    model: string | null,
  ) {
    const written = await chat.addMessage(
      conversation.id,
      { author: model ? 'assistant' : 'system', body: reply.body, replyToId: messageId, model },
      now(),
      reply.patch,
    );
    if (written !== 'duplicate' && reply.patch.needsSeller) await notifySeller(conversation);
  }

  return {
    /**
     * Répond au dernier message de l'acheteur. Un message dépassé (l'acheteur a écrit depuis) est laissé à son
     * propre job ; un job rejoué n'écrit pas de seconde réponse (une réponse par message, garanti par la base).
     */
    async reply(conversationId: string, messageId: string) {
      const conversation = await chat.findById(conversationId);
      if (!conversation) return;
      const transcript = await chat.recent(conversationId, TRANSCRIPT_LENGTH);
      const lastBuyer = transcript.filter((m) => m.author === 'buyer').at(-1);
      if (lastBuyer?.id !== messageId) return;
      if (transcript.some((m) => m.replyToId === messageId)) return;
      const listing = await listings.findById(conversation.listing.id);
      if (!listing) return;

      const { aiChatMonthlyLimit } = await shops.settings();
      if ((await chat.assistantRepliesSince(startOfMonth(now()))) >= aiChatMonthlyLimit) {
        await answer(
          conversation,
          messageId,
          { body: MESSAGES.assistantUnavailable, patch: { needsSeller: true } },
          null,
        );
        return;
      }
      const turn = await assistant.reply({
        listing: {
          title: listing.title,
          description: listing.description,
          category: listing.category.label,
          kind: listing.kind,
          condition: listing.condition,
          price: listing.price,
          quantity: listing.quantity,
          city: listing.city,
          district: listing.district,
        },
        shopName: listing.shop.name,
        sellerNotes: listing.sellerNotes,
        transcript: transcript.map((m) => ({ author: m.author, body: m.body })),
      });
      // Sans modèle (pas de clé), la question va au vendeur sans rien prétendre
      if (!turn.model) {
        await answer(
          conversation,
          messageId,
          { body: MESSAGES.assistantUnavailable, patch: { needsSeller: true } },
          null,
        );
        return;
      }
      await answer(conversation, messageId, await decide(turn, listing), turn.model);
    },

    /** Toutes les reprises ont échoué : le vendeur prend le relais, l'acheteur en est informé. */
    async fallbackToSeller(conversationId: string, messageId: string) {
      const conversation = await chat.findById(conversationId);
      if (!conversation) return;
      await answer(
        conversation,
        messageId,
        { body: MESSAGES.assistantUnavailable, patch: { needsSeller: true } },
        null,
      );
    },
  };
};

export type ChatReplyWorker = ReturnType<typeof createChatReplyWorker>;
