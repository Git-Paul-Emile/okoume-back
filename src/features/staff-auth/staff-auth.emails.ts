import type { EmailMessage } from '../../infrastructure/email/emailSender.js';

export const staffLoginCodeEmail = (to: string, firstName: string, code: string): EmailMessage => ({
  to,
  sensitive: true,
  subject: 'Votre code de connexion au back-office',
  text: [
    `Bonjour ${firstName},`,
    '',
    `Votre code de connexion : ${code}`,
    'Il est valable 10 minutes. Si vous n’êtes pas à l’origine de cette connexion, changez votre mot de passe',
    'et prévenez l’administrateur principal.',
  ].join('\n'),
});

export const staffInvitationCodeEmail = (to: string, firstName: string, code: string): EmailMessage => ({
  to,
  sensitive: true,
  subject: 'Activez votre accès au back-office',
  text: [
    `Bonjour ${firstName},`,
    '',
    `Votre code pour activer la double vérification : ${code}`,
    'Il est valable 10 minutes.',
  ].join('\n'),
});

/** Code de nouveau mot de passe : il ne suffit pas seul, un code de secours est aussi demandé. */
export const staffPasswordResetEmail = (to: string, firstName: string, code: string): EmailMessage => ({
  to,
  sensitive: true,
  subject: 'Nouveau mot de passe du back-office',
  text: [
    'Bonjour ' + firstName + ',',
    '',
    'Votre code pour choisir un nouveau mot de passe : ' + code,
    'Il est valable 10 minutes. Un de vos codes de secours vous sera aussi demandé.',
    '',
    'Si vous n’êtes pas à l’origine de cette demande, prévenez l’administrateur principal.',
  ].join('\n'),
});
