/**
 * Assistant d'achat du site public, dans le vocabulaire de la boutique (rules/10-stack/external-services.md) :
 * le service ne connaît pas le fournisseur d'IA. Le contexte (catalogue, livraison, paiement…) vient de la base.
 */
export interface ShopAssistantTurn {
  from: 'client' | 'assistant';
  text: string;
}

export interface ShopAssistantRequest {
  /** Données réelles de la boutique, mises en forme pour le modèle */
  context: string;
  history: ShopAssistantTurn[];
  question: string;
}

export interface ShopAssistantAnswer {
  reply: string;
  /** Produits du contexte à montrer sous la réponse (adresses courtes) */
  productSlugs: string[];
  model: string;
}

export interface ShopAssistant {
  answer(request: ShopAssistantRequest): Promise<ShopAssistantAnswer>;
}

/** Fournisseur injoignable ou réponse inexploitable : le site passe à ses réponses locales. */
export class ShopAssistantUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Assistant indisponible', { cause });
    this.name = 'ShopAssistantUnavailableError';
  }
}
