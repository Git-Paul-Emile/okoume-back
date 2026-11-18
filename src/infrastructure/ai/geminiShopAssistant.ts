import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { ShopAssistantUnavailableError, type ShopAssistant } from './shopAssistant.js';
import { describeRequest, SHOP_ASSISTANT_SYSTEM, shopAssistantSchema } from './shopAssistantPrompt.js';
import { parseJson } from './geminiSupport.js';

/** Assistant d'achat par Gemini (Google). Délai court : le client attend la réponse. */
export function createGeminiShopAssistant({ apiKey, model }: { apiKey: string; model: string }): ShopAssistant {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 25_000 } });
  const schema = z.toJSONSchema(shopAssistantSchema);
  return {
    async answer(request) {
      let text: string | undefined;
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: describeRequest(request) }] }],
          config: {
            systemInstruction: SHOP_ASSISTANT_SYSTEM,
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
            temperature: 0.4,
          },
        });
        text = response.text;
      } catch (error) {
        throw new ShopAssistantUnavailableError(error);
      }
      const parsed = shopAssistantSchema.safeParse(parseJson(text));
      if (!parsed.success) {
        logger.warn('Réponse de l’assistant d’achat inexploitable');
        throw new ShopAssistantUnavailableError();
      }
      return { reply: parsed.data.reply, productSlugs: parsed.data.products, model };
    },
  };
}
