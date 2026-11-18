import type { EmailMessage, EmailSender } from './emailSender.js';

/** Implémentation de test : garde les messages en mémoire pour les vérifier. */
export function createFakeEmailSender(): EmailSender & {
  sent: EmailMessage[];
  last(to: string): EmailMessage | undefined;
} {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
    last: (to) => [...sent].reverse().find((m) => m.to === to),
  };
}
