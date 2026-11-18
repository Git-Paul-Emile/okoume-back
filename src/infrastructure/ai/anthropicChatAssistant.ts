import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { logger } from '../../lib/logger.js';
import { ChatUnavailableError, type ChatAssistant, type ChatTurn } from './chatAssistant.js';
import { CHAT_SYSTEM, chatTurnSchema, describeChat } from './chatPrompt.js';

const isTransient = (error: unknown) =>
  error instanceof Anthropic.APIConnectionError ||
  error instanceof Anthropic.RateLimitError ||
  error instanceof Anthropic.InternalServerError;

export function createAnthropicChatAssistant({ apiKey, model }: { apiKey: string; model: string }): ChatAssistant {
  // Délai par appel et reprises dans l'adaptateur (rules/10-stack/external-services.md) ; la file reprend ensuite
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  return {
    async reply(context): Promise<ChatTurn> {
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 16_000,
          output_config: { effort: 'low', format: zodOutputFormat(chatTurnSchema) },
          system: CHAT_SYSTEM,
          cache_control: { type: 'ephemeral' },
          messages: [{ role: 'user', content: describeChat(context) }],
        });
        // Refus ou réponse illisible : la question va au vendeur, aucune réponse inventée
        if (response.stop_reason === 'refusal' || !response.parsed_output) {
          logger.warn({ stopReason: response.stop_reason }, 'Réponse du tchat sans avis exploitable');
          return { intent: 'needs_seller', reply: '', buyerOffer: null, model };
        }
        return { ...response.parsed_output, model };
      } catch (error) {
        if (isTransient(error)) throw new ChatUnavailableError(error);
        logger.error({ err: error }, 'Réponse du tchat impossible');
        return { intent: 'needs_seller', reply: '', buyerOffer: null, model };
      }
    },
  };
}
