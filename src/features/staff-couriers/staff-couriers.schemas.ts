import { z } from 'zod';
import { email, gabonPhone } from '../auth/auth.schemas.js';

const fields = {
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  phone: gabonPhone,
  email: email.nullable(),
  vehicle: z.enum(['moto', 'voiture', 'velo', 'a_pied']),
  active: z.boolean(),
  notes: z.string().trim().max(1_000),
  zoneIds: z.array(z.uuid()).max(200),
};

/** Fiche d'un livreur (9.3) : de quoi l'identifier, le joindre et savoir quelles zones il couvre. */
export const createCourierBody = z.strictObject({
  ...fields,
  email: fields.email.default(null),
  active: fields.active.default(true),
  notes: fields.notes.default(''),
  zoneIds: fields.zoneIds.default([]),
});

export type CreateCourierInput = z.infer<typeof createCourierBody>;

export const updateCourierBody = z
  .strictObject(fields)
  .partial()
  .refine((c) => Object.keys(c).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdateCourierInput = z.infer<typeof updateCourierBody>;

const flag = z.union([z.boolean(), z.stringbool()]).optional();

export const listCouriersQuery = z.strictObject({ zoneId: z.uuid().optional(), active: flag });

export type ListCouriersQuery = z.infer<typeof listCouriersQuery>;
