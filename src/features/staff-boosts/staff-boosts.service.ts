import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee, type Permission } from '../../core/security/permissions.js';
import { fcfa } from '../../core/text/fcfa.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import type { BoostRecord, BoostsRepository } from '../boosts/boosts.repository.js';
import type {
  BoostDecisionInput,
  CreateBoostPlanInput,
  ListBoostsQuery,
  UpdateBoostPlanInput,
} from '../boosts/boosts.schemas.js';
import { toBoostDto, toBoostPlanDto } from '../boosts/boosts.service.js';
import type { Notifier } from '../notifications/notifier.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import { notifySeller } from '../shops/shops.service.js';

export type StaffActor = Grantee & { id: string };

export interface StaffBoostsDependencies {
  boosts: BoostsRepository;
  shops: ShopsRepository;
  email: EmailSender;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

const date = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Africa/Libreville' }).format(d);

/** Message au vendeur sur la vérification de sa mise en avant : période, ou motif du refus. */
function decisionMessage(owner: { email: string; firstName: string }, boost: BoostRecord, appUrl: string) {
  const url = `${appUrl}/vendeur/mises-en-avant`;
  const period =
    boost.status === 'validated' && boost.startsAt && boost.endsAt
      ? { start: boost.startsAt, end: boost.endsAt }
      : null;
  const validated = period !== null;
  const body = period
    ? `Votre mise en avant de « ${boost.listing.title} » est validée : du ${date(period.start)} au ${date(period.end)}.`
    : `Votre paiement de ${fcfa(boost.amount)} (référence ${boost.reference}) pour « ${boost.listing.title} » n’a pas pu être validé : ${boost.decisionReason ?? ''}`;
  return {
    email: {
      to: owner.email,
      subject: validated ? 'Mise en avant validée' : 'Mise en avant non validée',
      text: [`Bonjour ${owner.firstName},`, '', body, '', url].join('\n'),
    },
    push: {
      title: validated ? 'Mise en avant validée' : 'Mise en avant non validée',
      body: boost.listing.title,
      url,
      tag: `mise-en-avant-${boost.id}`,
    },
  };
}

/** Offres et vérification des mises en avant (32.10) : vendeurs:consulter, vendeurs:modifier, vendeurs:valider. */
export const createStaffBoostsService = (deps: StaffBoostsDependencies) => {
  const { boosts, shops, now } = deps;

  function require(actor: Grantee, permission: Permission) {
    if (!can(actor, permission)) throw new ForbiddenError();
  }

  return {
    async plans(actor: Grantee) {
      require(actor, 'vendeurs:consulter');
      return (await boosts.listPlans({ activeOnly: false })).map(toBoostPlanDto);
    },

    async createPlan(input: CreateBoostPlanInput, actor: Grantee) {
      require(actor, 'vendeurs:modifier');
      const plan = await boosts.createPlan(input);
      if (plan === 'name_taken') throw new ConflictError('Une offre porte déjà ce nom.');
      return toBoostPlanDto(plan);
    },

    /** Une offre n'est jamais supprimée (les mises en avant la citent) : on la désactive. */
    async updatePlan(id: string, input: UpdateBoostPlanInput, actor: Grantee) {
      require(actor, 'vendeurs:modifier');
      const plan = await boosts.updatePlan(id, input);
      if (plan === 'name_taken') throw new ConflictError('Une offre porte déjà ce nom.');
      if (!plan) throw new NotFoundError('Offre introuvable.');
      return toBoostPlanDto(plan);
    },

    async list(query: ListBoostsQuery, actor: Grantee) {
      require(actor, 'vendeurs:consulter');
      const { items, total } = await boosts.list(query);
      return paginate(items.map(toBoostDto), total, query.page, query.limit);
    },

    async decide(id: string, input: BoostDecisionInput, actor: StaffActor) {
      require(actor, 'vendeurs:valider');
      if (!(await boosts.findById(id))) throw new NotFoundError('Mise en avant introuvable.');
      const at = now();
      const boost = await boosts.decide(
        id,
        input.status === 'validated'
          ? { validated: true, staffId: actor.id, at }
          : { validated: false, reason: input.reason, staffId: actor.id, at },
      );
      if (boost === 'stale') throw new ConflictError('Cette mise en avant a déjà été traitée.');
      const owner = await shops.findOwner(boost.shop.ownerId);
      if (owner) await notifySeller(deps, owner, decisionMessage(owner, boost, deps.appUrl));
      return toBoostDto(boost);
    },
  };
};

export type StaffBoostsService = ReturnType<typeof createStaffBoostsService>;
