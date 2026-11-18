import { z } from 'zod';

const fee = z.int('Montant entier en FCFA.').min(0).max(1_000_000);

const fields = {
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60),
  fee,
  eta: z.string().trim().min(2).max(40),
  days: z.string().trim().min(2).max(80),
  available: z.boolean(),
  courierCost: fee.nullable(),
  position: z.int().min(0).max(10_000),
};

export const createZoneBody = z.strictObject({
  ...fields,
  available: fields.available.default(true),
  courierCost: fields.courierCost.default(null),
  position: fields.position.default(0),
});

export type CreateZoneInput = z.infer<typeof createZoneBody>;

export const updateZoneBody = z
  .strictObject(fields)
  .partial()
  .refine((z) => Object.keys(z).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdateZoneInput = z.infer<typeof updateZoneBody>;
