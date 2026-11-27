import { z } from 'zod';

const MAX_PASSWORD_LENGTH = 128;

/** Adresse e-mail utilisée comme identifiant ; aucune confirmation par e-mail n'est demandée. */
export const email = z
  .string()
  .trim()
  .pipe(z.email('Saisissez une adresse e-mail complète.').max(254))
  .transform((value) => value.toLowerCase());

/** Numéro gabonais, avec ou sans indicatif : 077 12 34 56, +241 77 12 34 56. */
export const gabonPhone = z
  .string()
  .trim()
  .refine(
    (value) => /^(\+241|00241)?0?[1-7]\d{6,7}$/.test(value.replace(/[\s.-]/g, '')),
    'Saisissez un numéro gabonais valide.',
  );

export const customerPassword = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(MAX_PASSWORD_LENGTH)
  .refine((value) => /[a-z]/i.test(value) && /\d/.test(value), 'Utilisez au moins une lettre et un chiffre.');

const identifier = z.string().trim().min(3).max(254);

export const registerBody = z.strictObject({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email,
  phone: gabonPhone.optional(),
  password: customerPassword,
  acceptTerms: z.literal(true, 'Acceptez les conditions générales de vente.'),
});

export const loginBody = z.strictObject({ identifier, password: z.string().min(1).max(MAX_PASSWORD_LENGTH) });

export const contactChangeBody = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('email'), value: email }),
  z.strictObject({ type: z.literal('phone'), value: gabonPhone }),
]);

export type RegisterInput = z.infer<typeof registerBody>;
export type ContactChangeInput = z.infer<typeof contactChangeBody>;
