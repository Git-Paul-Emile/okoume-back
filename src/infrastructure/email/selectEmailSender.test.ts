import { describe, expect, it } from 'vitest';
import { devEmailSender } from './devEmailSender.js';
import { selectEmailSender } from './selectEmailSender.js';

const from = 'OKOZA <no-reply@okoza.test>';

describe('choix du service d’envoi', () => {
  it('écrit les e-mails dans les logs en développement sans clé', () => {
    expect(selectEmailSender({ NODE_ENV: 'development', RESEND_API_KEY: undefined, EMAIL_FROM: from })).toBe(
      devEmailSender,
    );
  });

  it('envoie réellement dès qu’une clé Resend est fournie', () => {
    const sender = selectEmailSender({ NODE_ENV: 'development', RESEND_API_KEY: 're_test', EMAIL_FROM: from });
    expect(sender).not.toBe(devEmailSender);
  });

  it('refuse de démarrer hors développement sans fournisseur', () => {
    expect(() => selectEmailSender({ NODE_ENV: 'production', RESEND_API_KEY: undefined, EMAIL_FROM: from })).toThrow(
      /RESEND_API_KEY/,
    );
  });
});
