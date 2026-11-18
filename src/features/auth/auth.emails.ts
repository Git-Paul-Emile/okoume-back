import type { EmailMessage } from '../../infrastructure/email/emailSender.js';

/** E-mails transactionnels des comptes clients, en français (seule langue de la plateforme). */

export const verificationEmail = (to: string, firstName: string, code: string): EmailMessage => ({
  to,
  sensitive: true,
  subject: 'Votre code de confirmation Okoumé',
  text: [
    `Bonjour ${firstName},`,
    '',
    `Voici votre code pour confirmer votre adresse e-mail : ${code}`,
    'Il est valable 10 minutes.',
    '',
    'Si vous n’avez pas créé de compte, ignorez ce message.',
  ].join('\n'),
});

export const existingAccountEmail = (to: string, appUrl: string): EmailMessage => ({
  to,
  subject: 'Une inscription a été tentée avec votre adresse',
  text: [
    'Bonjour,',
    '',
    'Quelqu’un a voulu créer un compte Okoumé avec votre adresse e-mail, qui a déjà un compte.',
    `Si c’était vous, connectez-vous ou choisissez un nouveau mot de passe : ${appUrl}/mot-de-passe-oublie`,
    'Sinon, vous pouvez ignorer ce message.',
  ].join('\n'),
});

export const passwordResetEmail = (to: string, firstName: string, code: string): EmailMessage => ({
  to,
  sensitive: true,
  subject: 'Votre code pour choisir un nouveau mot de passe',
  text: [
    `Bonjour ${firstName},`,
    '',
    `Voici votre code : ${code}`,
    'Il est valable 10 minutes. Si vous n’avez rien demandé, ignorez ce message : votre mot de passe ne change pas.',
  ].join('\n'),
});

/** Code de changement de coordonnées : envoyé à la nouvelle adresse, ou à l'adresse du compte pour un téléphone. */
export const contactChangeEmail = (to: string, firstName: string, code: string, what: string): EmailMessage => ({
  to,
  sensitive: true,
  subject: 'Votre code de modification Okoumé',
  text: [
    `Bonjour ${firstName},`,
    '',
    `Voici votre code pour confirmer ${what} : ${code}`,
    'Il est valable 10 minutes.',
    '',
    'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message et changez votre mot de passe.',
  ].join('\n'),
});

/** Prévient l'adresse précédente : un changement non voulu se repère tout de suite. */
export const contactChangedEmail = (to: string, firstName: string, what: string): EmailMessage => ({
  to,
  subject: 'Vos coordonnées Okoumé ont changé',
  text: [
    `Bonjour ${firstName},`,
    '',
    `${what} de votre compte vient d’être modifié.`,
    'Si vous n’êtes pas à l’origine de ce changement, écrivez-nous sans attendre depuis la page Contact.',
  ].join('\n'),
});
