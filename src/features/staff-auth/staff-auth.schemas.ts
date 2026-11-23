import { z } from 'zod';
import { email } from '../auth/auth.schemas.js';
import { simulateConfirmations } from '../../config/env.js';

const MAX_PASSWORD_LENGTH = 128;
const confirmationCode = simulateConfirmations
  ? z.string().trim().min(1).max(100)
  : z.string().trim().regex(/^\d{6}$/);

/** Mot de passe de l'équipe : plus long que celui des clients (accès aux données de la boutique). */
export const staffPassword = z
  .string()
  .min(12, 'Le mot de passe doit contenir au moins 12 caractères.')
  .max(MAX_PASSWORD_LENGTH)
  .refine((v) => /[a-z]/i.test(v) && /\d/.test(v), 'Utilisez au moins une lettre et un chiffre.');

export const staffLoginBody = z.strictObject({ email, password: z.string().min(1).max(MAX_PASSWORD_LENGTH) });

/** Second facteur : code reçu par e-mail ou code de secours (XXXX-XXXX). */
export const staffVerifyBody = z
  .strictObject({
    challengeId: z.uuid(),
    code: confirmationCode.optional(),
    backupCode: z.string().trim().min(8).max(12).optional(),
  })
  .refine((v) => !!v.code !== !!v.backupCode, 'Indiquez le code reçu ou un code de secours.');

export const invitationParams = z.strictObject({ token: z.string().min(20).max(100) });
export const acceptInvitationBody = z.strictObject({
  code: confirmationCode,
  password: staffPassword,
});

/** Mot de passe oublié de l'équipe : adresse professionnelle */
export const staffPasswordResetBody = z.strictObject({ email });

/** Nouveau mot de passe : code reçu par e-mail ET code de secours, pour garder deux facteurs */
export const staffPasswordResetConfirmBody = z.strictObject({
  email,
  code: confirmationCode,
  backupCode: z.string().trim().min(8).max(12),
  password: staffPassword,
});
