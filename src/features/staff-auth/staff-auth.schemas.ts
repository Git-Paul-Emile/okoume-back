import { z } from 'zod';
import { email } from '../auth/auth.schemas.js';

const MAX_PASSWORD_LENGTH = 128;

export const staffPassword = z
  .string()
  .min(12, 'Le mot de passe doit contenir au moins 12 caractères.')
  .max(MAX_PASSWORD_LENGTH)
  .refine((value) => /[a-z]/i.test(value) && /\d/.test(value), 'Utilisez au moins une lettre et un chiffre.');

export const staffLoginBody = z.strictObject({ email, password: z.string().min(1).max(MAX_PASSWORD_LENGTH) });
export const invitationParams = z.strictObject({ token: z.string().min(20).max(100) });
export const acceptInvitationBody = z.strictObject({ password: staffPassword });
