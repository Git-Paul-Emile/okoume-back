import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

const ORDER_STATUSES = [
  'confirmed',
  'preparing',
  'ready',
  'courier_assigned',
  'shipping',
  'delivered',
] as const;
const PAYMENT_STATUSES = ['awaiting_payment', 'paid'] as const;

/** Liste des commandes de l'équipe : pagination, recherche (numéro, nom, téléphone) et tri communs, filtres. */
export const listStaffOrdersQuery = listQuery(['createdAt', 'total'])
  .extend({
    status: z.enum(ORDER_STATUSES).optional(),
    paymentMethod: z.enum(['cash', 'airtel', 'moov']).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    /** Identifiant d'une boutique de vendeur, ou « okoza » pour la boutique OKOZA seule (32.4) */
    shopId: z.union([z.literal('okoza'), z.uuid()]).optional(),
  })
  .strict();

export type ListStaffOrdersQuery = z.infer<typeof listStaffOrdersQuery>;

/** Une transition par requête ; chaque action a ses propres champs obligatoires. */
export const transitionBody = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('advance'), note: z.string().trim().max(500).optional() }),
  z.strictObject({ action: z.literal('confirm_collection') }),
  /** Affectation (9.4) ; coût réel de la course, par défaut le coût habituel de la zone */
  z.strictObject({
    action: z.literal('assign_courier'),
    courierId: z.uuid('Livreur invalide.'),
    deliveryCost: z.int().min(0).max(1_000_000).optional(),
  }),
]);

export type TransitionInput = z.infer<typeof transitionBody>;

/** Coût réel de la course (9.5), modifiable à tout moment, distinct des frais facturés. */
export const deliveryCostBody = z.strictObject({ amount: z.int('Montant entier en FCFA.').min(0).max(1_000_000) });

