import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { ChatUnavailableError, type ChatAssistant, type ChatTurn } from './chatAssistant.js';
import { CHAT_SYSTEM, chatTurnSchema, describeChat } from './chatPrompt.js';
import { isTransientGeminiError, parseJson } from './geminiSupport.js';

/** Assistant du tchat par Gemini (Google), même contrat et mêmes consignes que les autres fournisseurs. */
export function createGeminiChatAssistant({ apiKey, model }: { apiKey: string; model: string }): ChatAssistant {
  // Délai par appel dans l'adaptateur ; la file reprend ensuite, puis le vendeur prend le relais
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60_000 } });
  const schema = z.toJSONSchema(chatTurnSchema);
  return {
    async reply(context): Promise<ChatTurn> {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: describeChat(context) }] }],
          config: { systemInstruction: CHAT_SYSTEM, responseMimeType: 'application/json', responseJsonSchema: schema },
        });
        // Réponse bloquée, vide ou hors format : la question va au vendeur, aucune réponse inventée
        const parsed = chatTurnSchema.safeParse(parseJson(response.text));
        if (!parsed.success) {
          logger.warn('Réponse du tchat sans avis exploitable');
          return { intent: 'needs_seller', reply: '', buyerOffer: null, model };
        }
        return { ...parsed.data, model };
      } catch (error) {
        if (isTransientGeminiError(error)) throw new ChatUnavailableError(error);
        logger.error({ err: error }, 'Réponse du tchat impossible');
        return { intent: 'needs_seller', reply: '', buyerOffer: null, model };
      }
    },
  };
}
