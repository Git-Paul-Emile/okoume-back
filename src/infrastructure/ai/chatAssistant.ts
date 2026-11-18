/**
 * Assistant du tchat Okoumé (cahier des charges, 32.5), dans le vocabulaire du métier. Il répond aux questions et
 * comprend l'intention de l'acheteur ; il ne décide jamais d'un prix : le serveur tranche, sans lui communiquer le
 * prix minimum du vendeur.
 */
export interface ChatContext {
  listing: {
    title: string;
    description: string;
    category: string;
    kind: 'product' | 'service';
    condition: string | null;
    price: number;
    quantity: number | null;
    city: string;
    district: string;
  };
  shopName: string;
  /** Consignes du vendeur (remise, horaires...) ; jamais son prix minimum */
  sellerNotes: string;
  /** Échanges récents, du plus ancien au plus récent ; le dernier message est celui de l'acheteur */
  transcript: Array<{ author: 'buyer' | 'assistant' | 'seller' | 'system'; body: string }>;
}

/**
 * answer : réponse rédigée par l'assistant. offer : l'acheteur propose un prix (buyerOffer). accept_price :
 * l'acheteur accepte le prix affiché. needs_seller : pas de réponse fiable possible, la question va au vendeur.
 * no_more_questions : l'acheteur n'a plus de question, la conversation se termine.
 */
export const CHAT_INTENTS = ['answer', 'offer', 'accept_price', 'needs_seller', 'no_more_questions'] as const;

export interface ChatTurn {
  intent: (typeof CHAT_INTENTS)[number];
  reply: string;
  buyerOffer: number | null;
  /** Modèle qui a rédigé la réponse, null si aucun modèle n'a été appelé */
  model: string | null;
}

export interface ChatAssistant {
  reply(context: ChatContext): Promise<ChatTurn>;
}

/** Fournisseur momentanément indisponible : la file reprend la réponse plus tard. */
export class ChatUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Assistant du tchat momentanément indisponible', { cause });
  }
}
