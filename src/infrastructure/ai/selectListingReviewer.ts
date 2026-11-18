import type { Env } from '../../config/env.js';
import { createAnthropicListingReviewer } from './anthropicListingReviewer.js';
import { createGeminiListingReviewer } from './geminiListingReviewer.js';
import type { ListingReviewer } from './listingReviewer.js';

/** Sans clé : aucune vérification automatique, chaque annonce soumise attend une décision humaine. */
export const humanOnlyReviewer: ListingReviewer = {
  review: async () => ({ outcome: 'moderation', issues: [], model: null }),
};

/** Choix du fournisseur par la configuration : Gemini s'il a une clé, sinon Anthropic, sinon décision humaine. */
export const selectListingReviewer = (
  config: Pick<
    Env,
    'GEMINI_API_KEY' | 'GEMINI_MODEL' | 'ANTHROPIC_API_KEY' | 'LISTING_REVIEW_MODEL' | 'CLOUDINARY_CLOUD_NAME'
  >,
): ListingReviewer => {
  if (config.GEMINI_API_KEY)
    return createGeminiListingReviewer({
      apiKey: config.GEMINI_API_KEY,
      model: config.GEMINI_MODEL,
      photoPrefix: config.CLOUDINARY_CLOUD_NAME
        ? `https://res.cloudinary.com/${config.CLOUDINARY_CLOUD_NAME}/image/upload/`
        : null,
    });
  if (config.ANTHROPIC_API_KEY)
    return createAnthropicListingReviewer({ apiKey: config.ANTHROPIC_API_KEY, model: config.LISTING_REVIEW_MODEL });
  return humanOnlyReviewer;
};
