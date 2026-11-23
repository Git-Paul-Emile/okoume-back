import { z } from 'zod';

/** Qui livre les commandes de la boutique, et les frais du vendeur par quartier s'il livre lui-même (32.5). */
export const sellerDeliveryBody = z
  .strictObject({
    mode: z.enum(['okoza', 'seller'], 'Choisissez qui livre vos commandes.'),
    fees: z
      .array(
        z.strictObject({
          zoneId: z.uuid('Quartier invalide.'),
          fee: z.int('Frais entiers en FCFA.').min(0).max(1_000_000),
        }),
      )
      .max(200)
      .default([]),
  })
  .refine((d) => new Set(d.fees.map((f) => f.zoneId)).size === d.fees.length, {
    message: 'Un quartier figure deux fois.',
    path: ['fees'],
  });

export type SellerDeliveryInput = z.infer<typeof sellerDeliveryBody>;
