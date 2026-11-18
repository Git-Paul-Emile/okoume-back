import { z } from 'zod';
import { legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    name: z.string().min(1),
    city: z.string().min(1),
    fee: z.number().int().min(0),
    eta: z.string(),
    days: z.string(),
    available: z.boolean(),
    courierCost: z.number().int().min(0).nullable().optional(),
  }),
);

/** Contenu validé de data/delivery-zones.json */
export const loadZones = () => readData('delivery-zones.json', schema);

export const zoneId = (legacyId: string) => legacyUuid('delivery-zone', legacyId);

/** Quartiers livrés, frais et coût habituel du livreur, dans l'ordre d'affichage. */
export const deliveryZonesSeeder: Seeder = {
  name: 'delivery-zones',
  demo: false,
  async run({ prisma }) {
    const zones = loadZones();
    const { count } = await prisma.deliveryZone.createMany({
      data: zones.map((zone, position) => ({
        id: zoneId(zone.id),
        name: zone.name,
        city: zone.city,
        fee: zone.fee,
        eta: zone.eta,
        days: zone.days,
        available: zone.available,
        courierCost: zone.courierCost ?? null,
        position,
      })),
      skipDuplicates: true,
    });
    return count;
  },
};
