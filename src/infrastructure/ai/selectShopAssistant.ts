import type { Env } from '../../config/env.js';
import { createGeminiShopAssistant } from './geminiShopAssistant.js';
import type { ShopAssistant } from './shopAssistant.js';

/** Gemini s'il a une clé ; sinon aucun assistant d'IA, le site répond avec ses règles locales. */
export const selectShopAssistant = (config: Pick<Env, 'GEMINI_API_KEY' | 'GEMINI_MODEL'>): ShopAssistant | null =>
  config.GEMINI_API_KEY ? createGeminiShopAssistant({ apiKey: config.GEMINI_API_KEY, model: config.GEMINI_MODEL }) : null;
