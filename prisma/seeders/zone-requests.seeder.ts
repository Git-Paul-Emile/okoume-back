import { z } from 'zod';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    neighbourhood: z.string().min(2),
    city: z.string().min(2),
    contact: z.string().min(6),
    status: z.enum(['new', 'added', 'declined']),
    note: z.string().optional(),
    createdAt: isoDate,
  }),
);

/** Contenu validé de data/zone-requests.json */
export const loadZoneRequests = () => readData('zone-requests.json', schema);

/** Demandes de nouveau quartier de démonstration (coordonnées fictives). */
export const zoneRequestsSeeder: Seeder = {
  name: 'zone-requests',
  demo: true,
  async run({ prisma }) {
    const { count } = await prisma.zoneRequest.createMany({
      data: loadZoneRequests().map(({ id, note, ...r }) => ({
        id: legacyUuid('zone-request', id),
        ...r,
        note: note ?? null,
      })),
      skipDuplicates: true,
    });
    return count;
  },
};
