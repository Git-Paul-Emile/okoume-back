import { ConflictError, ForbiddenError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import { mask } from '../staff-customers/staff-customers.service.js';
import type { DeliveryRecord, DeliveryStatus, EmailDeliveriesRepository } from './email-deliveries.repository.js';

/** Vue de l'équipe : jamais le texte ; le destinataire masqué sans le droit sur les données sensibles. */
const toDeliveryDto = (d: DeliveryRecord, sensitive: boolean) => ({
  id: d.id,
  to: sensitive ? d.to : (mask(d.to) ?? ''),
  subject: d.subject,
  status: d.status,
  attempts: d.attempts,
  lastError: d.lastError,
  /** Relance possible : en échec, non sensible, texte encore conservé */
  retryable: d.status === 'failed' && !d.sensitive && d.text !== null,
  sentAt: d.sentAt?.toISOString() ?? null,
  createdAt: d.createdAt.toISOString(),
});

export interface EmailDeliveriesDependencies {
  deliveries: EmailDeliveriesRepository;
  /** Envoi par la file : une relance repart avec ses reprises automatiques */
  email: EmailSender;
}

/**
 * Suivi des e-mails (10.3, 10.4) : lecture commandes:consulter, relance d'un échec commandes:modifier. Un e-mail
 * sensible (code, lien d'accès) ne se relance pas : la personne en redemande un depuis le site.
 */
export const createEmailDeliveriesService = (deps: EmailDeliveriesDependencies) => {
  const { deliveries, email } = deps;
  return {
    async list(query: { status?: DeliveryStatus | undefined; page: number; limit: number }, actor: Grantee) {
      if (!can(actor, 'commandes:consulter')) throw new ForbiddenError();
      const { items, total } = await deliveries.list(query);
      const sensitive = can(actor, 'donnees_sensibles:consulter');
      return paginate(
        items.map((d) => toDeliveryDto(d, sensitive)),
        total,
        query.page,
        query.limit,
      );
    },

    async retry(id: string, actor: Grantee) {
      if (!can(actor, 'commandes:modifier')) throw new ForbiddenError();
      const claimed = await deliveries.claimForRetry(id);
      if (!claimed?.text) throw new ConflictError('Cet e-mail ne peut pas être relancé.');
      await email.send({ to: claimed.to, subject: claimed.subject, text: claimed.text });
    },
  };
};

export type EmailDeliveriesService = ReturnType<typeof createEmailDeliveriesService>;
