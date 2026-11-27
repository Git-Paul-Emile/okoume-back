import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';
import { gabonPhone } from '../auth/auth.schemas.js';

const position = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const fields = {
  name: z.string().trim().min(3, 'Nom de boutique trop court.').max(80),
  description: z.string().trim().max(2_000),
  city: z.string().trim().min(2).max(60),
  district: z.string().trim().min(2).max(80),
  position: position.nullable(),
  phone: gabonPhone,
  acceptedPaymentMethods: z
    .array(z.enum(['cash', 'airtel', 'moov']))
    .min(1, 'Indiquez au moins un moyen de paiement.')
    .refine((v) => new Set(v).size === v.length, 'Moyen de paiement en double.'),
};

export const openShopBody = z.strictObject({
  ...fields,
  description: fields.description.default(''),
  position: fields.position.default(null),
  acceptedPaymentMethods: fields.acceptedPaymentMethods.default(['cash']),
});
export type OpenShopInput = z.infer<typeof openShopBody>;

export const updateShopBody = z
  .strictObject(fields)
  .partial()
  .refine((s) => Object.keys(s).length > 0, { message: 'Aucune modification envoyée.' });
export type UpdateShopInput = z.infer<typeof updateShopBody>;

export const pageQuery = listQuery(['createdAt']).pick({ page: true, limit: true }).strict();
export type PageQuery = z.infer<typeof pageQuery>;

export const slugParam = z.strictObject({ slug: z.string().regex(/^[a-z0-9-]{1,120}$/, 'Adresse invalide.') });
