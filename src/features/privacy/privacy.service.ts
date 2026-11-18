import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  UnprocessableError,
} from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { verifyPassword } from '../../core/security/passwords.js';
import { can, type Grantee, type Permission } from '../../core/security/permissions.js';
import { randomReadableCode } from '../../core/security/secrets.js';
import { logger } from '../../lib/logger.js';
import type { CustomersRepository } from '../auth/auth.repository.js';
import {
  ANONYMOUS_NAME,
  type DeletionBlockers,
  type NewPrivacyRequest,
  type PrivacyRepository,
  type PrivacyRequestRecord,
  type PrivacyRequestType,
} from './privacy.repository.js';
import type {
  CreatePrivacyRequestInput,
  ListPrivacyRequestsQuery,
  UpdatePrivacyRequestInput,
} from './privacy.schemas.js';

const DAY_MS = 24 * 60 * 60_000;
/** Délai de réponse à une demande (19.5) */
export const RESPONSE_DAYS = 30;
/** Durée sans connexion ni commande après laquelle un compte est anonymisé (19.5) */
export const INACTIVITY_YEARS = 3;
/** Comptes inactifs traités par passage : le traitement suivant reprend la suite */
const INACTIVE_BATCH = 200;
const NUMBER_ATTEMPTS = 5;
const SYSTEM = 'Système';
const CUSTOMER = 'Client';

export const toPrivacyRequestDto = (r: PrivacyRequestRecord) => ({
  id: r.id,
  number: r.number,
  customerId: r.customerId,
  name: r.name,
  email: r.email,
  type: r.type,
  details: r.details,
  status: r.status,
  response: r.response,
  history: r.history,
  dueAt: r.dueAt.toISOString(),
  createdAt: r.createdAt.toISOString(),
});

/** Explique au client ce qui empêche encore la suppression, sans jargon interne. */
export function blockersMessage(b: DeletionBlockers) {
  const reasons = [
    ...(b.orders.length ? [`commande(s) en cours ou à rembourser : ${b.orders.join(', ')}`] : []),
    ...(b.returns.length ? [`retour(s) en cours : ${b.returns.join(', ')}`] : []),
    ...(b.listingRequests.length ? [`demande(s) à un vendeur en cours : ${b.listingRequests.join(', ')}`] : []),
    ...(b.shop ? ['boutique de vendeur ouverte (contactez l’assistance pour la fermer)'] : []),
  ];
  return `Suppression impossible pour l’instant : ${reasons.join(' ; ')}.`;
}

const yearsBefore = (at: Date, years: number) => {
  const d = new Date(at);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
};

export interface PrivacyDependencies {
  privacy: PrivacyRepository;
  customers: Pick<CustomersRepository, 'findById'>;
  now: () => Date;
}

/**
 * Droits sur les données personnelles (19.5) : demandes d'accès et de correction suivies par l'équipe, export
 * immédiat, suppression du compte par anonymisation, et anonymisation des comptes inactifs depuis 3 ans.
 * Côté équipe : lecture donnees_sensibles:consulter, suivi donnees_sensibles:modifier, export donnees_sensibles:exporter.
 */
export const createPrivacyService = (deps: PrivacyDependencies) => {
  const { privacy, customers, now } = deps;

  async function record(request: Omit<NewPrivacyRequest, 'number'>) {
    for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt++) {
      const created = await privacy.create({
        ...request,
        number: `DP-${now().getUTCFullYear()}-${randomReadableCode(6)}`,
      });
      if (created) return created;
    }
    throw new Error('Impossible d’attribuer un numéro de demande unique.');
  }

  /** Trace d'une opération déjà faite (export téléchargé, compte supprimé) : close dès sa création. */
  function trace(
    customer: { id: string; name: string; email: string },
    type: PrivacyRequestType,
    details: string,
    response: string,
    event: string,
  ) {
    const at = now();
    return record({
      customerId: customer.id,
      name: customer.name,
      email: customer.email,
      type,
      details,
      status: 'completed',
      response,
      history: [{ at: at.toISOString(), by: SYSTEM, event }],
      dueAt: at,
    });
  }

  async function activeCustomer(customerId: string) {
    const customer = await customers.findById(customerId);
    if (!customer || customer.status === 'anonymized') throw new UnauthorizedError();
    return { ...customer, name: `${customer.firstName} ${customer.lastName}` };
  }

  function require(actor: Grantee, permission: Permission) {
    if (!can(actor, permission)) throw new ForbiddenError();
  }

  async function staffRequest(id: string) {
    const request = await privacy.findById(id);
    if (!request) throw new NotFoundError('Demande introuvable.');
    return request;
  }

  async function staffName(actor: { id: string }) {
    return (await privacy.staffName(actor.id)) ?? 'Équipe';
  }

  return {
    mine: async (customerId: string) => (await privacy.listForCustomer(customerId)).map(toPrivacyRequestDto),

    /** Une seule demande ouverte par type : la suivante attend la réponse à la première. */
    async create(customerId: string, input: CreatePrivacyRequestInput) {
      const customer = await activeCustomer(customerId);
      const open = (await privacy.listForCustomer(customerId)).find(
        (r) => r.type === input.type && (r.status === 'received' || r.status === 'in_progress'),
      );
      if (open) throw new ConflictError(`Votre demande ${open.number} est déjà en cours de traitement.`);
      const at = now();
      const created = await record({
        customerId,
        name: customer.name,
        email: customer.email,
        type: input.type,
        details: input.details,
        status: 'received',
        response: null,
        history: [{ at: at.toISOString(), by: CUSTOMER, event: 'Demande envoyée' }],
        dueAt: new Date(at.getTime() + RESPONSE_DAYS * DAY_MS),
      });
      return toPrivacyRequestDto(created);
    },

    /** Export immédiat de ses données par le client ; l'opération est gardée dans le suivi de ses demandes. */
    async exportMine(customerId: string) {
      const customer = await activeCustomer(customerId);
      const data = await privacy.exportData(customerId);
      if (!data) throw new UnauthorizedError();
      await trace(
        customer,
        'export',
        'Téléchargement depuis le compte',
        'Vos données ont été téléchargées.',
        'Export téléchargé depuis le compte',
      );
      return { generatedAt: now().toISOString(), ...data };
    },

    /**
     * Suppression du compte par le client (2.2, 19.5) : mot de passe redemandé, puis anonymisation immédiate.
     * Une trace sans donnée identifiante reste pour l'équipe.
     */
    async deleteMine(customerId: string, password: string) {
      const customer = await activeCustomer(customerId);
      // 422 et non 401 : la session reste valide, seul le mot de passe saisi est faux
      if (!(await verifyPassword(customer.passwordHash, password)))
        throw new UnprocessableError('Mot de passe incorrect.');
      const blockers = await privacy.anonymize(customerId, now());
      if (blockers) throw new ConflictError(blockersMessage(blockers));
      await trace(
        { id: customerId, name: ANONYMOUS_NAME, email: '' },
        'deletion',
        'Suppression effectuée par le client depuis son compte',
        'Compte supprimé et données anonymisées.',
        'Compte supprimé depuis l’espace client (anonymisation immédiate)',
      );
    },

    async list(query: ListPrivacyRequestsQuery, actor: Grantee) {
      require(actor, 'donnees_sensibles:consulter');
      const { items, total } = await privacy.list({ status: query.status, page: query.page, limit: query.limit });
      return paginate(items.map(toPrivacyRequestDto), total, query.page, query.limit);
    },

    async get(id: string, actor: Grantee) {
      require(actor, 'donnees_sensibles:consulter');
      return toPrivacyRequestDto(await staffRequest(id));
    },

    /** Export des données du client concerné, pour répondre à une demande d'accès ou d'export. */
    async exportFor(id: string, actor: Grantee & { id: string }) {
      require(actor, 'donnees_sensibles:exporter');
      const request = await staffRequest(id);
      const data = request.customerId ? await privacy.exportData(request.customerId) : null;
      if (!data) throw new ConflictError('Ce compte est supprimé : il n’y a plus de données à exporter.');
      await privacy.update(
        request.id,
        {},
        {
          at: now().toISOString(),
          by: await staffName(actor),
          event: 'Export des données généré',
        },
      );
      return { generatedAt: now().toISOString(), ...data };
    },

    /**
     * Suivi par l'équipe. Clore une demande de suppression anonymise le compte, sauf si un échange est
     * encore en cours : la demande reste alors ouverte et l'équipe voit pourquoi.
     */
    async update(id: string, input: UpdatePrivacyRequestInput, actor: Grantee & { id: string }) {
      require(actor, 'donnees_sensibles:modifier');
      const request = await staffRequest(id);
      if (request.status === 'completed' || request.status === 'refused')
        throw new ConflictError('Cette demande est déjà close.');
      const by = await staffName(actor);
      const at = now();
      if (input.status === 'in_progress') {
        if (request.status === 'in_progress') throw new ConflictError('Cette demande est déjà prise en charge.');
        const updated = await privacy.update(
          id,
          { status: 'in_progress' },
          {
            at: at.toISOString(),
            by,
            event: 'Prise en charge',
          },
        );
        if (!updated) throw new NotFoundError('Demande introuvable.');
        return toPrivacyRequestDto(updated);
      }
      if (input.status === 'refused') {
        const reason = input.response;
        if (!reason) throw new UnprocessableError('Indiquez le motif du refus.');
        const updated = await privacy.update(
          id,
          { status: 'refused', response: reason },
          {
            at: at.toISOString(),
            by,
            event: `Refusée : ${reason}`,
          },
        );
        if (!updated) throw new NotFoundError('Demande introuvable.');
        return toPrivacyRequestDto(updated);
      }
      if (request.type === 'deletion') {
        if (request.customerId) {
          const blockers = await privacy.anonymize(request.customerId, at);
          if (blockers) throw new ConflictError(blockersMessage(blockers));
        }
        const updated = await privacy.update(
          id,
          {
            status: 'completed',
            response: input.response ?? 'Votre compte a été supprimé et vos données anonymisées.',
          },
          { at: at.toISOString(), by, event: 'Compte anonymisé' },
        );
        if (!updated) throw new NotFoundError('Demande introuvable.');
        return toPrivacyRequestDto(updated);
      }
      if (!input.response) throw new UnprocessableError('Rédigez la réponse au client.');
      const updated = await privacy.update(
        id,
        { status: 'completed', response: input.response },
        {
          at: at.toISOString(),
          by,
          event: 'Demande traitée',
        },
      );
      if (!updated) throw new NotFoundError('Demande introuvable.');
      return toPrivacyRequestDto(updated);
    },

    /**
     * Traitement planifié (19.5) : anonymise les comptes sans connexion ni commande depuis 3 ans. Un compte avec
     * un échange encore en cours est laissé tel quel et revu au passage suivant.
     */
    async anonymizeInactive() {
      const at = now();
      const ids = await privacy.inactiveCustomers(yearsBefore(at, INACTIVITY_YEARS), INACTIVE_BATCH);
      let anonymized = 0;
      for (const id of ids) {
        if (await privacy.anonymize(id, at)) {
          logger.warn({ customerId: id }, 'Compte inactif non anonymisé : un échange est encore en cours');
          continue;
        }
        await trace(
          { id, name: ANONYMOUS_NAME, email: '' },
          'deletion',
          `Compte inactif depuis ${INACTIVITY_YEARS} ans`,
          'Compte anonymisé à l’échéance de sa durée de conservation.',
          'Compte anonymisé par le traitement des comptes inactifs',
        );
        anonymized++;
      }
      return { examined: ids.length, anonymized };
    },
  };
};

export type PrivacyService = ReturnType<typeof createPrivacyService>;
