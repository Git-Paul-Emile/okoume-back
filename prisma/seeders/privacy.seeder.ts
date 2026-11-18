import { z } from 'zod';
import { customerId } from './customers.seeder.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    number: z.string().min(1),
    userId: z.string(),
    name: z.string().min(1),
    email: z.email(),
    type: z.enum(['access', 'export', 'correction', 'deletion']),
    details: z.string(),
    status: z.enum(['received', 'in_progress', 'completed', 'refused']),
    response: z.string().optional(),
    createdAt: isoDate,
    dueAt: isoDate,
    history: z.array(z.object({ at: z.string(), by: z.string(), event: z.string() })),
  }),
);

/** Contenu validé de data/privacy-requests.json */
export const loadPrivacyRequests = () => readData('privacy-requests.json', schema);

/** Demandes sur les données personnelles de démonstration, en cours de traitement. */
export const privacySeeder: Seeder = {
  name: 'privacy-requests',
  demo: true,
  async run({ prisma }) {
    const { count } = await prisma.privacyRequest.createMany({
      data: loadPrivacyRequests().map((r) => ({
        id: legacyUuid('privacy-request', r.id),
        number: r.number,
        customerId: customerId(r.userId),
        name: r.name,
        email: r.email.toLowerCase(),
        type: r.type,
        details: r.details,
        status: r.status,
        response: r.response ?? null,
        history: r.history,
        dueAt: r.dueAt,
        createdAt: r.createdAt,
      })),
      skipDuplicates: true,
    });
    return count;
  },
};
