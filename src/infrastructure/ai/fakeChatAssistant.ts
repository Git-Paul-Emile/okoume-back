import { ChatUnavailableError, type ChatAssistant, type ChatContext, type ChatTurn } from './chatAssistant.js';

/** Implémentation de test : tour réglable, contextes reçus gardés, panne simulable. */
export function createFakeChatAssistant() {
  let next: Omit<ChatTurn, 'model'> = { intent: 'answer', reply: 'Réponse de test.', buyerOffer: null };
  let unavailable = false;
  const received: ChatContext[] = [];
  const assistant: ChatAssistant = {
    async reply(context) {
      if (unavailable) throw new ChatUnavailableError(new Error('panne simulée'));
      received.push(context);
      return { ...next, model: 'modele-de-test' };
    },
  };
  return {
    assistant,
    received,
    answer: (turn: Omit<ChatTurn, 'model'>) => {
      next = turn;
    },
    setUnavailable: (value: boolean) => {
      unavailable = value;
    },
  };
}
