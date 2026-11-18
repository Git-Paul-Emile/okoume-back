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
  /** Point choisi sur la carte, ou null : la boutique est alors classée au niveau du quartier */
  position: position.nullable(),
  phone: gabonPhone,
  /** Moyens de paiement acceptés, réglés hors plateforme entre l'acheteur et le vendeur (32.7) */
  acceptedPaymentMethods: z
    .array(z.enum(['cash', 'airtel', 'moov']))
    .min(1, 'Indiquez au moins un moyen de paiement.')
    .refine((v) => new Set(v).size === v.length, 'Moyen de paiement en double.'),
  handoverModes: z
    .array(z.enum(['pickup', 'seller_delivery']))
    .min(1, 'Indiquez au moins un mode de remise.')
    .refine((v) => new Set(v).size === v.length, 'Mode de remise en double.'),
};

/** Ouverture d'une boutique (32.2) : sa fiche et l'offre d'accès choisie. */
export const openShopBody = z.strictObject({
  ...fields,
  description: fields.description.default(''),
  position: fields.position.default(null),
  acceptedPaymentMethods: fields.acceptedPaymentMethods.default(['cash']),
  handoverModes: fields.handoverModes.default(['pickup']),
  planId: z.uuid(),
});

export type OpenShopInput = z.infer<typeof openShopBody>;

export const updateShopBody = z
  .strictObject(fields)
  .partial()
  .refine((s) => Object.keys(s).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdateShopInput = z.infer<typeof updateShopBody>;

/** Passage direct sur une offre gratuite ; une offre payante s'active par un paiement validé. */
export const changePlanBody = z.strictObject({ planId: z.uuid() });

/** Paiement Mobile Money effectué hors plateforme, à vérifier par l'administration (32.2, 8.4). */
export const declarePaymentBody = z.strictObject({
  planId: z.uuid(),
  method: z.enum(['airtel', 'moov']),
  reference: z
    .string()
    .trim()
    .min(4, 'Indiquez la référence de la transaction.')
    .max(60)
    .transform((v) => v.toUpperCase()),
  amount: z.int().positive().max(100_000_000),
});

export type DeclarePaymentInput = z.infer<typeof declarePaymentBody>;

export const pageQuery = listQuery(['createdAt']).pick({ page: true, limit: true }).strict();

export type PageQuery = z.infer<typeof pageQuery>;

export const slugParam = z.strictObject({ slug: z.string().regex(/^[a-z0-9-]{1,120}$/, 'Adresse invalide.') });
