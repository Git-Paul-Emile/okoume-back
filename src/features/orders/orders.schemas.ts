import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';
import { email, gabonPhone } from '../auth/auth.schemas.js';

export const MAX_LINES = 50;
export const MAX_QUANTITY_PER_LINE = 20;

/**
 * Commande envoyée par le navigateur : articles, quantités, livraison et paiement, rien d'autre.
 * Prix, remises et frais sont recalculés par l'API ; un champ en plus est refusé (schéma strict).
 */
/** Un seul code par commande (11.2) ; points : 100 au moins, vérifiés par le calcul (12.2). */
const promoCode = z.string().trim().min(3).max(40);
const points = z.int().min(0).max(1_000_000);

export const createOrderBody = z.strictObject({
  idempotencyKey: z.uuid('Clé de commande invalide.'),
  lines: z
    .array(
      z.strictObject({
        variantId: z.uuid('Article invalide.'),
        quantity: z
          .int()
          .min(1)
          .max(MAX_QUANTITY_PER_LINE, `${MAX_QUANTITY_PER_LINE} exemplaires au plus par article.`),
      }),
    )
    .min(1, 'Votre panier est vide.')
    .max(MAX_LINES),
  delivery: z.strictObject({
    recipient: z.string().trim().min(2).max(80),
    phone: gabonPhone,
    email,
    zoneId: z.uuid('Zone de livraison invalide.'),
    landmark: z.string().trim().min(3, 'Indiquez un repère pour le livreur.').max(200),
    instructions: z.string().trim().max(300, 'Les consignes sont limitées à 300 caractères.').default(''),
  }),
  paymentMethod: z.enum(['cash', 'airtel', 'moov']),
  promoCode: promoCode.optional(),
  points: points.default(0),
});

/** Type d'entrée : points facultatifs (0 par défaut), comme dans le schéma. */
export type CreateOrderInput = z.input<typeof createOrderBody>;

/** Devis du panier : mêmes articles, zone, code et points que la commande, sans coordonnées. */
export const quoteBody = z.strictObject({
  lines: createOrderBody.shape.lines,
  /** Facultative : sans zone, le devis ne compte pas la livraison (page panier) */
  zoneId: z.uuid('Zone de livraison invalide.').optional(),
  promoCode: promoCode.optional(),
  points: points.default(0),
});

export type QuoteInput = z.input<typeof quoteBody>;

/** Historique du client : pagination commune, de la plus récente à la plus ancienne ; filtre par numéro facultatif. */
export const listOrdersQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({ number: z.string().trim().toUpperCase().max(30).optional() })
  .strict();

export type ListOrdersQuery = z.infer<typeof listOrdersQuery>;

/** Motifs proposés au client (front/src/features/orders/orders.constants.ts). */
export const CANCEL_REASONS = [
  'Changement d’avis',
  'Erreur dans la commande',
  'Retard de livraison',
  'Produit indisponible',
  'Autre motif',
] as const;

export const cancellationRequestBody = z.strictObject({
  reason: z.enum(CANCEL_REASONS, 'Choisissez un motif d’annulation.'),
  comment: z.string().trim().max(500).default(''),
});

export const feeChangeDecisionBody = z.strictObject({ status: z.enum(['accepted', 'refused']) });

export const disputeBody = z.strictObject({
  reason: z.string().trim().min(10, 'Décrivez ce qui s’est passé (10 caractères au moins).').max(1_000),
});

/** Rattachement d'une commande passée sans compte : numéro et code de suivi reçus par e-mail */
export const claimOrderBody = z.strictObject({
  number: z.string().trim().min(5).max(30),
  code: z.string().trim().min(4).max(12),
});

export const trackingQuery = z.strictObject({
  number: z.string().trim().min(5).max(30),
  code: z.string().trim().min(4).max(12),
});
