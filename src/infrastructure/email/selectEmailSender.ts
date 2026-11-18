import type { Env } from '../../config/env.js';
import { devEmailSender } from './devEmailSender.js';
import type { EmailSender } from './emailSender.js';
import { createResendEmailSender } from './resendEmailSender.js';

/**
 * Choix du service d'envoi par la configuration. Avec une clé Resend, l'envoi est réel, y compris en
 * développement. Sans clé, seul le développement écrit les e-mails dans les logs ; ailleurs, la
 * configuration exige la clé (src/config/env.ts) : aucun e-mail n'est perdu en silence.
 */
export const selectEmailSender = (config: Pick<Env, 'NODE_ENV' | 'RESEND_API_KEY' | 'EMAIL_FROM'>): EmailSender => {
  if (config.RESEND_API_KEY) return createResendEmailSender({ apiKey: config.RESEND_API_KEY, from: config.EMAIL_FROM });
  if (config.NODE_ENV === 'development') return devEmailSender;
  throw new Error('RESEND_API_KEY manquante : aucun service d’envoi d’e-mails pour cet environnement.');
};
