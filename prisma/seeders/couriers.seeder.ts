import { z } from 'zod';
import { zoneId } from './delivery-zones.seeder.js';
import { legacyUuid, readData, type Seeder } from './support.js';

/** Véhicules saisis en toutes lettres dans le json-server, ramenés aux valeurs de l'API */
const VEHICLES = { Moto: 'moto', Voiture: 'voiture', Vélo: 'velo', 'À pied': 'a_pied' } as const;

const schema = z.array(
  z.object({
    id: z.string(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().nullable(),
    vehicle: z.enum(['Moto', 'Voiture', 'Vélo', 'À pied']),
    zoneIds: z.array(z.string()),
    active: z.boolean(),
    notes: z.string(),
  }),
);

/** Contenu validé de data/couriers.json */
export const loadCouriers = () => readData('couriers.json', schema);

/** Répertoire des livreurs et quartiers qu'ils couvrent. */
export const couriersSeeder: Seeder = {
  name: 'couriers',
  demo: true,
  async run({ prisma }) {
    const couriers = loadCouriers();
    const id = (legacyId: string) => legacyUuid('courier', legacyId);
    const { count } = await prisma.courier.createMany({
      data: couriers.map((c) => ({
        id: id(c.id),
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        vehicle: VEHICLES[c.vehicle],
        active: c.active,
        notes: c.notes,
      })),
      skipDuplicates: true,
    });
    await prisma.courierZone.createMany({
      data: couriers.flatMap((c) => c.zoneIds.map((zone) => ({ courierId: id(c.id), zoneId: zoneId(zone) }))),
      skipDuplicates: true,
    });
    return count;
  },
};
