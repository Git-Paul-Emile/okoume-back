import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { logger } from '../../lib/logger.js';
import { describeListing, LISTING_REVIEW_SYSTEM, listingVerdictSchema } from './listingReviewPrompt.js';
import { ReviewUnavailableError, type ListingReviewer, type ReviewVerdict } from './listingReviewer.js';

/** Échec passager (réseau, limite de débit, panne du fournisseur) : la vérification sera reprise. */
const isTransient = (error: unknown) =>
  error instanceof Anthropic.APIConnectionError ||
  error instanceof Anthropic.RateLimitError ||
  error instanceof Anthropic.InternalServerError;

export interface AnthropicReviewerConfig {
  apiKey: string;
  model: string;
}

export function createAnthropicListingReviewer({ apiKey, model }: AnthropicReviewerConfig): ListingReviewer {
  // Délai par appel et reprises dans l'adaptateur (rules/10-stack/external-services.md) ; la file reprend ensuite
  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 2 });
  return {
    async review(listing): Promise<ReviewVerdict> {
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 16_000,
          output_config: { effort: 'medium', format: zodOutputFormat(listingVerdictSchema) },
          system: LISTING_REVIEW_SYSTEM,
          cache_control: { type: 'ephemeral' },
          messages: [
            {
              role: 'user',
              content: [
                ...listing.photoUrls.map((url) => ({ type: 'image' as const, source: { type: 'url' as const, url } })),
                { type: 'text', text: describeListing(listing) },
              ],
            },
          ],
        });
        // Un refus du modèle ou une réponse illisible est un signal à examiner : la décision revient à une personne
        if (response.stop_reason === 'refusal' || !response.parsed_output) {
          logger.warn({ stopReason: response.stop_reason }, 'Vérification d’annonce sans avis exploitable');
          return { outcome: 'moderation', issues: [], model };
        }
        return { ...response.parsed_output, model };
      } catch (error) {
        if (isTransient(error)) throw new ReviewUnavailableError(error);
        // Requête refusée (photo inaccessible, configuration) : pas de reprise, examen humain
        logger.error({ err: error }, 'Vérification d’annonce impossible');
        return { outcome: 'moderation', issues: [], model };
      }
    },
  };
}
