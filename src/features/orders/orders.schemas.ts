import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';
import { email, gabonPhone } from '../auth/auth.schemas.js';

export const MAX_LINES = 50;
export const MAX_QUANTITY_PER_LINE = 20;

/**
 * Commande envoyée par le navigateur : articles, quantités, livraison et paiement, rien d'autre.
 * Prix, remises et frais sont recalculés par l'API ; un champ en plus est refusé (schéma strict).
 */
/** Un seul code promotionnel simple par commande. */
const promoCode = z.string().trim().min(3).max(40);

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
});

export type CreateOrderInput = z.input<typeof createOrderBody>;

/** Devis du panier : mêmes articles, zone et code que la commande, sans coordonnées. */
export const quoteBody = z.strictObject({
  lines: createOrderBody.shape.lines,
  /** Facultative : sans zone, le devis ne compte pas la livraison (page panier) */
  zoneId: z.uuid('Zone de livraison invalide.').optional(),
  promoCode: promoCode.optional(),
});

export type QuoteInput = z.input<typeof quoteBody>;

/** Historique du client : pagination commune, de la plus récente à la plus ancienne ; filtre par numéro facultatif. */
export const listOrdersQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({ number: z.string().trim().toUpperCase().max(30).optional() })
  .strict();

export type ListOrdersQuery = z.infer<typeof listOrdersQuery>;

export const trackingQuery = z.strictObject({
  number: z.string().trim().min(5).max(30),
  code: z.string().trim().min(4).max(12),
});
