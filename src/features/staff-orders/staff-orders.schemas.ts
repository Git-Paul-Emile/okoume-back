import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

const ORDER_STATUSES = [
  'confirmed',
  'preparing',
  'ready',
  'courier_assigned',
  'shipping',
  'delivered',
  'cancelled',
  'claim',
] as const;
const PAYMENT_STATUSES = ['awaiting_payment', 'awaiting_verification', 'paid', 'refund_due', 'refunded'] as const;

/** Liste des commandes de l'équipe : pagination, recherche (numéro, nom, téléphone) et tri communs, filtres. */
export const listStaffOrdersQuery = listQuery(['createdAt', 'total'])
  .extend({
    status: z.enum(ORDER_STATUSES).optional(),
    paymentMethod: z.enum(['cash', 'airtel', 'moov']).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    /** pending : commandes signalées, en attente de vérification (19.3) */
    review: z.enum(['pending']).optional(),
    /** Identifiant d'une boutique de vendeur, ou « okoume » pour la boutique Okoumé seule (32.4) */
    shopId: z.union([z.literal('okoume'), z.uuid()]).optional(),
  })
  .strict();

/** Vérification d'une commande signalée : ce qui a été contrôlé (appel du client, pièce, paiement…) */
export const reviewClearanceBody = z.strictObject({
  note: z.string().trim().min(10, 'Indiquez ce qui a été vérifié (10 caractères au moins).').max(500),
});

export type ListStaffOrdersQuery = z.infer<typeof listStaffOrdersQuery>;

/** Motifs d'échec de livraison (front/src/features/admin/orders.actions.ts). */
export const DELIVERY_FAILURE_REASONS = [
  'Client absent ou injoignable',
  'Adresse ou repère introuvable',
  'Colis refusé par le client',
  'Paiement en espèces impossible',
  'Incident pendant la livraison',
] as const;

const reason = z.string().trim().min(5, 'Indiquez le motif (5 caractères au moins).').max(500);

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
  z.strictObject({ action: z.literal('cancel'), reason }),
  z.strictObject({ action: z.literal('reopen'), reason }),
  z.strictObject({
    action: z.literal('delivery_failed'),
    reason: z.enum(DELIVERY_FAILURE_REASONS, 'Choisissez le motif de l’échec.'),
    decision: z.enum(['retry', 'cancel']),
  }),
]);

export type TransitionInput = z.infer<typeof transitionBody>;

/** Coût réel de la course (9.5), modifiable à tout moment, distinct des frais facturés. */
export const deliveryCostBody = z.strictObject({ amount: z.int('Montant entier en FCFA.').min(0).max(1_000_000) });

/** Résolution d'une contestation de livraison (9.6), communiquée au client. */
export const disputeResolutionBody = z.strictObject({ resolution: reason });

export const cancellationDecisionBody = z.strictObject({
  status: z.enum(['accepted', 'refused']),
  decisionReason: z.string().trim().min(3, 'Indiquez la raison communiquée au client.').max(500),
});

export type CancellationDecisionInput = z.infer<typeof cancellationDecisionBody>;
