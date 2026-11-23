import { z } from 'zod';

const MAX_PASSWORD_LENGTH = 128;

/** Adresse e-mail : espaces retirés avant la validation (copier-coller), puis mise en minuscules. */
export const email = z
  .string()
  .trim()
  .pipe(z.email('Saisissez une adresse e-mail complète.').max(254))
  .transform((v) => v.toLowerCase());

/** Numéro gabonais, avec ou sans indicatif : 077 12 34 56, +241 77 12 34 56. */
export const gabonPhone = z
  .string()
  .trim()
  .refine(
    (v) => /^(\+241|00241)?0?[1-7]\d{6,7}$/.test(v.replace(/[\s.-]/g, '')),
    'Saisissez un numéro gabonais valide.',
  );

export const customerPassword = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(MAX_PASSWORD_LENGTH)
  .refine((v) => /[a-z]/i.test(v) && /\d/.test(v), 'Utilisez au moins une lettre et un chiffre.');

const code = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Le code contient 6 chiffres.');
const identifier = z.string().trim().min(3).max(254);

export const registerBody = z.strictObject({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email,
  phone: gabonPhone.optional(),
  password: customerPassword,
  acceptTerms: z.literal(true, 'Acceptez les conditions générales de vente.'),
});

export const verifyEmailBody = z.strictObject({ email, code });
export const resendCodeBody = z.strictObject({ email });
export const loginBody = z.strictObject({ identifier, password: z.string().min(1).max(MAX_PASSWORD_LENGTH) });
export const passwordResetRequestBody = z.strictObject({ identifier });
export const passwordResetConfirmBody = z.strictObject({ identifier, code, password: customerPassword });

export type RegisterInput = z.infer<typeof registerBody>;

/** Changement d'e-mail ou de téléphone : mot de passe demandé, puis code à usage unique. */
export const contactChangeBody = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('email'),
    value: email,
    password: z.string().min(1).max(200),
  }),
  z.strictObject({ type: z.literal('phone'), value: gabonPhone, password: z.string().min(1).max(200) }),
]);

export type ContactChangeInput = z.infer<typeof contactChangeBody>;

export const contactChangeConfirmationBody = z.strictObject({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Le code contient 6 chiffres.'),
});
