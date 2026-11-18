import { z } from 'zod';
import { customerId } from './customers.seeder.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    number: z.string().regex(/^SAV-\d+$/),
    userId: z.string().nullable(),
    email: z.email(),
    name: z.string().min(2),
    category: z.enum(['commande', 'livraison', 'retour', 'produit', 'compte', 'publicite']),
    orderNumber: z.string().nullable(),
    subject: z.string().min(1),
    status: z.enum(['open', 'pending', 'resolved', 'closed']),
    priority: z.enum(['normal', 'high']),
    satisfaction: z.number().int().min(1).max(5).nullable(),
    closureReason: z.string().optional(),
    createdAt: isoDate,
    messages: z
      .array(z.object({ id: z.string(), from: z.enum(['customer', 'support']), body: z.string().min(1), at: isoDate }))
      .min(1),
  }),
);

/** Contenu validé de data/tickets.json */
export const loadTickets = () => readData('tickets.json', schema);

/**
 * Numéro au format de l'API (SAV-AAAA-XXXXXX) : l'ancien numéro du prototype (SAV-00031) est gardé dans les
 * chiffres, l'année est celle de la demande.
 */
export const ticketNumber = (legacy: string, createdAt: Date) =>
  `SAV-${createdAt.getUTCFullYear()}-${legacy.replace(/\D/g, '').padStart(6, '0').slice(-6)}`;

/**
 * Demandes d'assistance de démonstration. Une demande résolue ou clôturée porte sa solution (contrainte de la base) :
 * à défaut dans les données, la dernière réponse de l'assistance en tient lieu.
 */
export const ticketsSeeder: Seeder = {
  name: 'tickets',
  demo: true,
  async run({ prisma }) {
    let created = 0;
    for (const t of loadTickets()) {
      const id = legacyUuid('ticket', t.id);
      if (await prisma.supportTicket.findUnique({ where: { id }, select: { id: true } })) continue;
      const closed = t.status === 'resolved' || t.status === 'closed';
      const lastAnswer = [...t.messages].reverse().find((m) => m.from === 'support');
      await prisma.supportTicket.create({
        data: {
          id,
          number: ticketNumber(t.number, t.createdAt),
          customerId: t.userId ? customerId(t.userId) : null,
          email: t.email.toLowerCase(),
          name: t.name,
          category: t.category,
          orderNumber: t.orderNumber,
          subject: t.subject,
          status: t.status,
          priority: t.priority,
          satisfaction: t.satisfaction,
          closureReason: closed ? (t.closureReason ?? lastAnswer?.body ?? 'Demande traitée.') : null,
          resolvedAt: closed ? (t.messages.at(-1)?.at ?? t.createdAt) : null,
          createdAt: t.createdAt,
          messages: {
            create: t.messages.map((m) => ({
              id: legacyUuid('ticket-message', `${t.id}-${m.id}`),
              author: m.from,
              body: m.body,
              createdAt: m.at,
            })),
          },
        },
      });
      created++;
    }
    return created;
  },
};
