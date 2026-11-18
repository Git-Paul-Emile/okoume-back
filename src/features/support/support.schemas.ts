import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';
import { email } from '../auth/auth.schemas.js';

export const TICKET_CATEGORIES = ['commande', 'livraison', 'retour', 'produit', 'compte', 'publicite'] as const;
export const TICKET_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;

const body = z.string().trim().min(2, 'Message trop court.').max(2_000, '2 000 caractères au plus.');
/** Images jointes, déjà envoyées chez l'hébergeur avec l'autorisation de l'API */
const attachments = z
  .array(z.url({ protocol: /^https$/, message: 'Adresse HTTPS attendue.' }).max(500))
  .max(4, '4 images au plus.')
  .default([]);

/** Demande d'assistance (15.1), depuis le compte ou le formulaire de contact. */
export const createTicketBody = z.strictObject({
  name: z.string().trim().min(2, 'Saisissez votre nom.').max(80),
  email,
  category: z.enum(TICKET_CATEGORIES, 'Choisissez le sujet de votre demande.'),
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(CMD-\d{4}-[A-Z0-9]{5,6})?$/, 'Le numéro de commande a le format CMD-2026-12345.')
    .default(''),
  subject: z.string().trim().min(5, 'Résumez votre demande en quelques mots.').max(150),
  message: z.string().trim().min(20, 'Décrivez votre demande en 20 caractères minimum.').max(2_000),
  attachments,
});

export type CreateTicketInput = z.infer<typeof createTicketBody>;

export const messageBody = z.strictObject({ body, attachments });
export type MessageInput = z.infer<typeof messageBody>;

export const reopenBody = z.strictObject({
  reason: z.string().trim().min(5, 'Indiquez pourquoi la demande doit être rouverte.').max(1_000),
});

export const satisfactionBody = z.strictObject({ score: z.int().min(1).max(5) });

export const ticketNumberParam = z.strictObject({
  number: z.string().regex(/^SAV-\d{4}-[A-Z0-9]{6}$/, 'Numéro de demande invalide.'),
});

export const listMyTicketsQuery = listQuery(['createdAt']).pick({ page: true, limit: true }).strict();

export const listStaffTicketsQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true, search: true })
  .extend({
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(['normal', 'high']).optional(),
    assigneeId: z.uuid().optional(),
  })
  .strict();

export type ListStaffTicketsQuery = z.infer<typeof listStaffTicketsQuery>;

/** Suivi par l'équipe : statut, priorité, responsable ; une demande résolue ou clôturée porte sa solution. */
export const updateTicketBody = z
  .strictObject({
    status: z.enum(TICKET_STATUSES),
    priority: z.enum(['normal', 'high']),
    assigneeId: z.uuid().nullable(),
    closureReason: z.string().trim().min(5, 'Indiquez la solution ou le motif, communiqué au client.').max(1_000),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdateTicketInput = z.infer<typeof updateTicketBody>;
