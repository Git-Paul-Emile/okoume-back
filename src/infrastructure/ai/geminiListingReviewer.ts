import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { isTransientGeminiError, parseJson, photoParts } from './geminiSupport.js';
import { describeListing, LISTING_REVIEW_SYSTEM, listingVerdictSchema } from './listingReviewPrompt.js';
import { ReviewUnavailableError, type ListingReviewer, type ReviewVerdict } from './listingReviewer.js';

export interface GeminiReviewerConfig {
  apiKey: string;
  model: string;
  /** Début des adresses des photos de la boutique (compte Cloudinary), ou null */
  photoPrefix: string | null;
}

/** Vérification d'annonce par Gemini (Google), même contrat et mêmes consignes que les autres fournisseurs. */
export function createGeminiListingReviewer({ apiKey, model, photoPrefix }: GeminiReviewerConfig): ListingReviewer {
  // Délai par appel dans l'adaptateur (rules/10-stack/external-services.md) ; la file reprend ensuite
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 90_000 } });
  const schema = z.toJSONSchema(listingVerdictSchema);
  return {
    async review(listing): Promise<ReviewVerdict> {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [...(await photoParts(listing.photoUrls, photoPrefix)), { text: describeListing(listing) }],
            },
          ],
          config: {
            systemInstruction: LISTING_REVIEW_SYSTEM,
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
          },
        });
        // Réponse bloquée, vide ou hors format : une personne décide, aucun avis n'est inventé
        const parsed = listingVerdictSchema.safeParse(parseJson(response.text));
        if (!parsed.success) {
          logger.warn('Vérification d’annonce sans avis exploitable');
          return { outcome: 'moderation', issues: [], model };
        }
        return { ...parsed.data, model };
      } catch (error) {
        if (isTransientGeminiError(error)) throw new ReviewUnavailableError(error);
        logger.error({ err: error }, 'Vérification d’annonce impossible');
        return { outcome: 'moderation', issues: [], model };
      }
    },
  };
}
