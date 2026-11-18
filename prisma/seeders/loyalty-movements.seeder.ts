import { z } from 'zod';
import { customerId } from './customers.seeder.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    userId: z.string(),
    points: z
      .number()
      .int()
      .refine((p) => p !== 0, 'Mouvement sans points'),
    type: z.enum(['earn', 'redeem', 'restore', 'reversal', 'adjust', 'referral', 'birthday']),
    label: z.string().min(1),
    createdAt: isoDate,
  }),
);

/** Contenu validé de data/loyalty-movements.json */
export const loadLoyaltyMovements = () => readData('loyalty-movements.json', schema);

/**
 * Mouvements de points : le solde d'un client est leur somme. Un gain cite sa commande dans son libellé
 * (« Commande CMD-2026-00102 livrée et payée ») : il y est rattaché, comme le fait l'API.
 */
export const loyaltyMovementsSeeder: Seeder = {
  name: 'loyalty-movements',
  demo: true,
  async run({ prisma }) {
    const movements = loadLoyaltyMovements();
    const numbers = movements.flatMap((m) => /CMD-\d{4}-\d{5}/.exec(m.label) ?? []);
    const orders = await prisma.order.findMany({
      where: { number: { in: numbers } },
      select: { id: true, number: true },
    });
    const byNumber = new Map(orders.map((o) => [o.number, o.id]));
    const { count } = await prisma.loyaltyMovement.createMany({
      data: movements.map((m) => ({
        id: legacyUuid('loyalty-movement', m.id),
        customerId: customerId(m.userId),
        points: m.points,
        type: m.type,
        label: m.label,
        orderId: byNumber.get(/CMD-\d{4}-\d{5}/.exec(m.label)?.[0] ?? '') ?? null,
        createdAt: m.createdAt,
      })),
      skipDuplicates: true,
    });
    return count;
  },
};
