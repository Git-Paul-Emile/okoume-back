import type { Env } from '../../config/env.js';
import { createAnthropicChatAssistant } from './anthropicChatAssistant.js';
import type { ChatAssistant } from './chatAssistant.js';
import { createGeminiChatAssistant } from './geminiChatAssistant.js';

/** Sans clé : aucune réponse automatique, chaque question est transmise au vendeur. */
export const sellerOnlyAssistant: ChatAssistant = {
  reply: async () => ({ intent: 'needs_seller', reply: '', buyerOffer: null, model: null }),
};

/** Choix du fournisseur par la configuration : Gemini s'il a une clé, sinon Anthropic, sinon le vendeur répond. */
export const selectChatAssistant = (
  config: Pick<Env, 'GEMINI_API_KEY' | 'GEMINI_MODEL' | 'ANTHROPIC_API_KEY' | 'CHAT_MODEL'>,
): ChatAssistant => {
  if (config.GEMINI_API_KEY)
    return createGeminiChatAssistant({ apiKey: config.GEMINI_API_KEY, model: config.GEMINI_MODEL });
  if (config.ANTHROPIC_API_KEY)
    return createAnthropicChatAssistant({ apiKey: config.ANTHROPIC_API_KEY, model: config.CHAT_MODEL });
  return sellerOnlyAssistant;
};
