import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

const amount = z.int('Montant entier en FCFA.').min(0).max(100_000_000);

const fields = {
  /** Lettres, chiffres et tirets ; enregistré en majuscules */
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,40}$/, 'Code de 3 à 40 lettres, chiffres ou tirets.')
    .transform((v) => v.toUpperCase()),
  label: z.string().trim().min(3).max(120),
  type: z.enum(['percent', 'fixed']),
  /** 0 seulement pour un code de livraison offerte sans autre réduction */
  value: z.int().min(0).max(100_000_000),
  minAmount: amount,
  freeDelivery: z.boolean(),
  endsAt: z.coerce.date(),
  maxUses: z.int().min(1).max(10_000_000).nullable(),
  active: z.boolean(),
  productIds: z.array(z.uuid()).max(500),
  categoryIds: z.array(z.uuid()).max(200),
};

const coherent = <
  T extends { type?: 'percent' | 'fixed'; value?: number; freeDelivery?: boolean },
>(
  schema: z.ZodType<T>,
) =>
  schema
    .refine((p) => p.type !== 'percent' || p.value === undefined || p.value <= 100, {
      message: 'Un pourcentage ne dépasse pas 100.',
      path: ['value'],
    })
    .refine((p) => p.value !== 0 || p.freeDelivery === true, {
      message: 'Une réduction de 0 n’est possible que pour la livraison offerte.',
      path: ['value'],
    })

/** Coupon immédiat et simple : remise, périmètre, date de fin et limite globale. */
export const createPromoCodeBody = coherent(
  z.strictObject({
    ...fields,
    minAmount: fields.minAmount.default(0),
    freeDelivery: fields.freeDelivery.default(false),
    maxUses: fields.maxUses.default(null),
    active: fields.active.default(true),
    productIds: fields.productIds.default([]),
    categoryIds: fields.categoryIds.default([]),
  }),
);

export type CreatePromoCodeInput = z.infer<typeof createPromoCodeBody>;

export const updatePromoCodeBody = coherent(
  z
    .strictObject(fields)
    .partial()
    .refine((p) => Object.keys(p).length > 0, { message: 'Aucune modification envoyée.' }),
);

export type UpdatePromoCodeInput = z.infer<typeof updatePromoCodeBody>;

export const listPromoCodesQuery = listQuery(['createdAt']).pick({ page: true, limit: true, search: true }).strict();

export type ListPromoCodesQuery = z.infer<typeof listPromoCodesQuery>;
