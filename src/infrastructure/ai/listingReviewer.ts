/**
 * Vérification assistée d'une annonce (cahier des charges, 32.3), dans le vocabulaire du métier
 * (rules/10-stack/external-services.md). Le code métier ne connaît ni le fournisseur ni le modèle.
 */
export interface ListingToReview {
  title: string;
  description: string;
  /** Nom complet de la catégorie choisie, par exemple « Mode > Femme > Robes » */
  category: string;
  kind: 'product' | 'service';
  condition: string | null;
  price: number;
  quantity: number | null;
  city: string;
  district: string;
  photoUrls: string[];
}

export const ISSUE_FIELDS = ['title', 'description', 'category', 'photos', 'price', 'location', 'other'] as const;

export interface ReviewIssue {
  field: (typeof ISSUE_FIELDS)[number];
  message: string;
}

/**
 * approved : rien à redire. changes_requested : erreurs que le vendeur peut corriger.
 * moderation : contenu suspect, interdit ou doute ; une personne décide. L'IA ne refuse jamais seule.
 */
export interface ReviewVerdict {
  outcome: 'approved' | 'changes_requested' | 'moderation';
  issues: ReviewIssue[];
  /** Modèle qui a rendu l'avis, null si aucun modèle n'a été appelé */
  model: string | null;
}

export interface ListingReviewer {
  review(listing: ListingToReview): Promise<ReviewVerdict>;
}

/** Fournisseur momentanément indisponible : la file reprend la vérification plus tard. */
export class ReviewUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Vérification automatique momentanément indisponible', { cause });
  }
}
