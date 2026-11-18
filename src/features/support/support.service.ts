import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnprocessableError,
} from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { randomReadableCode } from '../../core/security/secrets.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { EmailMessage, EmailSender } from '../../infrastructure/email/emailSender.js';
import type { MediaStorage } from '../../infrastructure/media/mediaStorage.js';
import { logger } from '../../lib/logger.js';
import type { Notifier } from '../notifications/notifier.js';
import type { InformationRepository } from '../settings/settings.repository.js';
import {
  newTicketMessage,
  ticketAnsweredEmail,
  ticketAnsweredPush,
  ticketClosedEmail,
  ticketReceivedEmail,
} from './support.emails.js';
import type { SupportRepository, TicketRecord } from './support.repository.js';
import type { CreateTicketInput, ListStaffTicketsQuery, MessageInput, UpdateTicketInput } from './support.schemas.js';

const DAY_MS = 24 * 60 * 60_000;
const NUMBER_ATTEMPTS = 5;
const CLOSED: TicketRecord['status'][] = ['resolved', 'closed'];

/** Vue du client : la conversation sans le nom des membres de l'équipe ni l'organisation interne. */
export const toTicketDto = (t: TicketRecord) => ({
  id: t.id,
  number: t.number,
  email: t.email,
  name: t.name,
  category: t.category,
  orderNumber: t.orderNumber,
  subject: t.subject,
  status: t.status,
  priority: t.priority,
  satisfaction: t.satisfaction,
  closureReason: t.closureReason,
  resolvedAt: t.resolvedAt?.toISOString() ?? null,
  reopenedAt: t.reopenedAt?.toISOString() ?? null,
  messages: t.messages.map((m) => ({
    id: m.id,
    from: m.author,
    body: m.body,
    attachments: m.attachments,
    at: m.createdAt.toISOString(),
  })),
  createdAt: t.createdAt.toISOString(),
});

/** Vue de l'équipe : responsable, compte du client et auteur de chaque réponse. */
export const toStaffTicketDto = (t: TicketRecord) => {
  const base = toTicketDto(t);
  return {
    ...base,
    customerId: t.customerId,
    assigneeId: t.assigneeId,
    messages: base.messages.map((m, i) => ({ ...m, staffName: t.messages[i]?.staffName ?? null })),
  };
};

export interface SupportDependencies {
  support: SupportRepository;
  information: Pick<InformationRepository, 'get'>;
  media: MediaStorage | null;
  email: EmailSender;
  notifier: Notifier;
  appUrl: string;
  /** Délai pour rouvrir une demande résolue ou clôturée (15.3), en jours */
  reopenDays: number;
  now: () => Date;
}

/**
 * Assistance (15) : demandes depuis le compte ou le formulaire de contact, échanges, réouverture, satisfaction ;
 * côté équipe, suivi, réponses et clôture. Lecture clients:consulter, réponses et suivi clients:modifier.
 */
export const createSupportService = (deps: SupportDependencies) => {
  const { support, information, media, email, notifier, appUrl, reopenDays, now } = deps;

  /** L'e-mail est un service rendu au client : son échec ne doit pas faire perdre la demande déjà enregistrée. */
  async function deliver(message: EmailMessage, ticket: TicketRecord) {
    try {
      await email.send(message);
    } catch (err) {
      logger.error({ err, ticket: ticket.number }, 'E-mail de l’assistance non déposé');
    }
  }

  function checkAttachments(urls: readonly string[]) {
    if (urls.length && (!media || urls.some((url) => !media.isHostedUrl(url))))
      throw new UnprocessableError('Joignez les images depuis ce formulaire.');
  }

  async function own(customerId: string, number: string) {
    const ticket = await support.findByNumber(number);
    if (!ticket || ticket.customerId !== customerId) throw new NotFoundError('Demande introuvable.');
    return ticket;
  }

  function require(actor: Grantee, write: boolean) {
    if (!can(actor, write ? 'clients:modifier' : 'clients:consulter')) throw new ForbiddenError();
  }

  async function staffTicket(id: string) {
    const ticket = await support.findById(id);
    if (!ticket) throw new NotFoundError('Demande introuvable.');
    return ticket;
  }

  return {
    /** Autorisation d'envoyer une image jointe ; réservée aux comptes (le formulaire de contact n'en a pas). */
    signAttachmentUpload() {
      if (!media) throw new ServiceUnavailableError('L’envoi d’images n’est pas encore configuré.');
      const upload = media.signUpload('support', now());
      return { ...upload, expiresAt: upload.expiresAt.toISOString() };
    },

    async create(input: CreateTicketInput, customerId: string | null) {
      checkAttachments(input.attachments);
      const at = now();
      const ticket = {
        customerId,
        email: input.email,
        name: input.name,
        category: input.category,
        orderNumber: input.orderNumber || null,
        subject: input.subject,
        // Un retour ou une réclamation passe en priorité (15.3)
        priority: input.category === 'retour' ? ('high' as const) : ('normal' as const),
        message: { body: input.message, attachments: input.attachments },
      };
      for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt++) {
        const created = await support.create({
          ...ticket,
          number: `SAV-${at.getUTCFullYear()}-${randomReadableCode(6)}`,
        });
        if (!created) continue;
        const info = await information.get();
        await deliver(
          ticketReceivedEmail(
            created,
            appUrl,
            created.priority === 'high' ? info.supportSlaHigh : info.supportSlaNormal,
          ),
          created,
        );
        await notifier.notifyStaff('clients:consulter', newTicketMessage(created, appUrl), created.priority === 'high');
        return toTicketDto(created);
      }
      throw new Error('Impossible d’attribuer un numéro de demande unique.');
    },

    async mine(customerId: string, page: { page: number; limit: number }) {
      const { items, total } = await support.listForCustomer(customerId, page);
      return paginate(items.map(toTicketDto), total, page.page, page.limit);
    },

    get: async (customerId: string, number: string) => toTicketDto(await own(customerId, number)),

    /** Réponse du client : la demande revient « à traiter » côté équipe. */
    async reply(customerId: string, number: string, input: MessageInput) {
      const ticket = await own(customerId, number);
      if (CLOSED.includes(ticket.status))
        throw new ConflictError('Cette demande est close : rouvrez-la pour la compléter.');
      checkAttachments(input.attachments);
      const updated = await support.addMessage(
        ticket.id,
        { author: 'customer', staffId: null, body: input.body, attachments: input.attachments },
        { status: 'open' },
      );
      if (!updated) throw new NotFoundError('Demande introuvable.');
      return toTicketDto(updated);
    },

    /** Réouverture d'une demande résolue ou clôturée, dans le délai prévu (15.3). */
    async reopen(customerId: string, number: string, reason: string) {
      const ticket = await own(customerId, number);
      if (!CLOSED.includes(ticket.status)) throw new ConflictError('Cette demande est encore ouverte.');
      const closedAt = ticket.resolvedAt ?? ticket.createdAt;
      if (now().getTime() - closedAt.getTime() > reopenDays * DAY_MS)
        throw new ConflictError(`Le délai de ${reopenDays} jours est dépassé : ouvrez une nouvelle demande.`);
      const updated = await support.addMessage(
        ticket.id,
        { author: 'customer', staffId: null, body: `Demande rouverte : ${reason}`, attachments: [] },
        { status: 'open', reopenedAt: now(), resolvedAt: null, closureReason: null },
      );
      if (!updated) throw new NotFoundError('Demande introuvable.');
      await notifier.notifyStaff('clients:consulter', newTicketMessage(updated, appUrl), updated.priority === 'high');
      return toTicketDto(updated);
    },

    /** Note de satisfaction, une fois la demande résolue ou clôturée, et une seule fois. */
    async rate(customerId: string, number: string, score: number) {
      const ticket = await own(customerId, number);
      if (!CLOSED.includes(ticket.status)) throw new ConflictError('La note se donne une fois la demande résolue.');
      if (ticket.satisfaction !== null) throw new ConflictError('Vous avez déjà noté cette demande.');
      const updated = await support.update(ticket.id, { satisfaction: score });
      if (!updated) throw new NotFoundError('Demande introuvable.');
      return toTicketDto(updated);
    },

    async list(query: ListStaffTicketsQuery, actor: Grantee) {
      require(actor, false);
      const { items, total } = await support.listForStaff(query);
      return paginate(items.map(toStaffTicketDto), total, query.page, query.limit);
    },

    async staffGet(id: string, actor: Grantee) {
      require(actor, false);
      return toStaffTicketDto(await staffTicket(id));
    },

    /** Réponse de l'équipe : envoyée au client par e-mail et sur ses appareils ; la demande attend sa réponse. */
    async answer(id: string, body: string, actor: Grantee & { id: string }) {
      require(actor, true);
      const ticket = await staffTicket(id);
      const updated = await support.addMessage(
        ticket.id,
        { author: 'support', staffId: actor.id, body, attachments: [] },
        {
          status: CLOSED.includes(ticket.status) ? ticket.status : 'pending',
          ...(ticket.assigneeId ? {} : { assigneeId: actor.id }),
        },
      );
      if (!updated) throw new NotFoundError('Demande introuvable.');
      await deliver(ticketAnsweredEmail(updated, body, appUrl), updated);
      if (updated.customerId)
        await notifier.notifyCustomer(updated.customerId, 'support', ticketAnsweredPush(updated, appUrl));
      return toStaffTicketDto(updated);
    },

    /** Statut, priorité, responsable ; une demande résolue ou clôturée porte sa solution, envoyée au client. */
    async update(id: string, input: UpdateTicketInput, actor: Grantee) {
      require(actor, true);
      const ticket = await staffTicket(id);
      if (input.assigneeId && !(await support.staffExists(input.assigneeId)))
        throw new UnprocessableError('Membre de l’équipe introuvable.');
      const status = input.status ?? ticket.status;
      const closing = CLOSED.includes(status);
      const closureReason = input.closureReason ?? (closing ? ticket.closureReason : null);
      if (closing && !closureReason)
        throw new UnprocessableError('Indiquez la solution ou le motif, communiqué au client.');
      const updated = await support.update(ticket.id, {
        ...input,
        closureReason,
        resolvedAt: closing ? (CLOSED.includes(ticket.status) ? ticket.resolvedAt : now()) : null,
      });
      if (!updated) throw new NotFoundError('Demande introuvable.');
      if (closing && !CLOSED.includes(ticket.status)) await deliver(ticketClosedEmail(updated, appUrl), updated);
      return toStaffTicketDto(updated);
    },
  };
};

export type SupportService = ReturnType<typeof createSupportService>;
