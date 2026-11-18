import type { EmailMessage } from '../../infrastructure/email/emailSender.js';
import type { PushMessage } from '../../infrastructure/push/pushSender.js';
import type { TicketRecord } from './support.repository.js';

/** Messages de l'assistance : le client garde le numéro de sa demande pour toute la suite des échanges. */

const ticketUrl = (appUrl: string, t: TicketRecord) =>
  t.customerId ? `${appUrl}/compte/assistance/${t.number}` : `${appUrl}/contact`;

export const ticketReceivedEmail = (t: TicketRecord, appUrl: string, slaHours: number): EmailMessage => ({
  to: t.email,
  subject: `Demande ${t.number} reçue : ${t.subject}`,
  text: [
    `Bonjour ${t.name},`,
    '',
    `Nous avons bien reçu votre demande ${t.number}. Notre équipe vous répond sous ${slaHours} heures ouvrées au plus.`,
    t.customerId
      ? 'Vous pouvez suivre et compléter votre demande depuis votre espace client :'
      : 'Nous vous répondons par e-mail. Pour toute précision, indiquez ce numéro dans votre message.',
    '',
    ticketUrl(appUrl, t),
  ].join('\n'),
});

export const ticketAnsweredEmail = (t: TicketRecord, body: string, appUrl: string): EmailMessage => ({
  to: t.email,
  subject: `Réponse à votre demande ${t.number}`,
  text: [`Bonjour ${t.name},`, '', body, '', ticketUrl(appUrl, t)].join('\n'),
});

export const ticketClosedEmail = (t: TicketRecord, appUrl: string): EmailMessage => ({
  to: t.email,
  subject: `Demande ${t.number} ${t.status === 'resolved' ? 'résolue' : 'clôturée'}`,
  text: [
    `Bonjour ${t.name},`,
    '',
    `Votre demande ${t.number} est ${t.status === 'resolved' ? 'résolue' : 'clôturée'}.`,
    t.closureReason ? `Solution : ${t.closureReason}` : '',
    '',
    'Si le problème persiste, vous pouvez rouvrir la demande depuis votre espace client.',
    ticketUrl(appUrl, t),
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n'),
});

export const newTicketMessage = (t: TicketRecord, appUrl: string): PushMessage => ({
  title: t.priority === 'high' ? `Demande urgente ${t.number}` : `Nouvelle demande ${t.number}`,
  body: t.subject,
  url: `${appUrl}/admin/assistance`,
  tag: `ticket-${t.number}`,
});

export const ticketAnsweredPush = (t: TicketRecord, appUrl: string): PushMessage => ({
  title: `Réponse à votre demande ${t.number}`,
  body: t.subject,
  url: ticketUrl(appUrl, t),
  tag: `ticket-${t.number}`,
});
