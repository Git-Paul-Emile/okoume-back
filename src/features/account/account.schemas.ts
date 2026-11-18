import { z } from 'zod';
import { gabonPhone } from '../auth/auth.schemas.js';

const name = z.string().trim().min(2, 'Deux caractères minimum.').max(60);

/** Identité modifiable par le client. L'e-mail et le téléphone changent à part, avec vérification par code. */
export const profileBody = z
  .strictObject({ firstName: name.optional(), lastName: name.optional() })
  .refine((v) => v.firstName !== undefined || v.lastName !== undefined, 'Indiquez au moins un champ à modifier.');

const addressFields = {
  label: z.string().trim().min(1, 'Donnez un nom à cette adresse (Maison, Bureau…).').max(40),
  recipient: z.string().trim().min(3, 'Saisissez le nom et le prénom du destinataire.').max(80),
  phone: gabonPhone,
  zoneId: z.uuid('Choisissez votre quartier.'),
  landmark: z.string().trim().min(5, 'Indiquez un repère précis pour aider le livreur.').max(200),
  instructions: z.string().trim().max(300, 'Les instructions sont limitées à 300 caractères.'),
};

export const createAddressBody = z.strictObject({
  ...addressFields,
  instructions: addressFields.instructions.default(''),
});

/** Modification partielle ; « isDefault: true » fait de cette adresse l'adresse par défaut. */
export const updateAddressBody = z
  .strictObject({
    label: addressFields.label.optional(),
    recipient: addressFields.recipient.optional(),
    phone: addressFields.phone.optional(),
    zoneId: addressFields.zoneId.optional(),
    landmark: addressFields.landmark.optional(),
    instructions: addressFields.instructions.optional(),
    isDefault: z.literal(true).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Indiquez au moins un champ à modifier.');

export const productIdParam = z.strictObject({ productId: z.uuid('Identifiant de produit invalide.') });

export type ProfileInput = z.infer<typeof profileBody>;
export type CreateAddressInput = z.infer<typeof createAddressBody>;
export type UpdateAddressInput = z.infer<typeof updateAddressBody>;
