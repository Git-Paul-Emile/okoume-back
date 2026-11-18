import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee, type Permission } from '../../core/security/permissions.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import type { Notifier } from '../notifications/notifier.js';
import { toPaymentDto, toPlanDto, toShopDto } from '../shops/shops.dto.js';
import { paymentDecisionMessage, suspensionMessage } from '../shops/shops.emails.js';
import type { MarketplaceSettingsRecord, ShopRecord, ShopsRepository } from '../shops/shops.repository.js';
import { notifySeller } from '../shops/shops.service.js';
import {
  planTermsError,
  type CreatePlanInput,
  type ListShopPaymentsQuery,
  type ListShopsQuery,
  type PaymentDecisionInput,
  type ShopActionInput,
  type UpdatePlanInput,
} from './staff-shops.schemas.js';

export type StaffActor = Grantee & { id: string };

export interface StaffShopsDependencies {
  shops: ShopsRepository;
  email: EmailSender;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

/**
 * Administration de la place de marché (32.2) : offres d'accès, boutiques et paiements des abonnements.
 * Lecture vendeurs:consulter, réglages vendeurs:modifier, décisions vendeurs:valider.
 */
export const createStaffShopsService = (deps: StaffShopsDependencies) => {
  const { shops, now } = deps;

  function require(actor: Grantee, permission: Permission) {
    if (!can(actor, permission)) throw new ForbiddenError();
  }

  async function view(shop: ShopRecord) {
    const { graceDays } = await shops.settings();
    return toShopDto(shop, now(), graceDays);
  }

  async function ownerOf(shop: { ownerId: string }) {
    const owner = await shops.findOwner(shop.ownerId);
    if (!owner) throw new Error(`Propriétaire de boutique ${shop.ownerId} introuvable`);
    return owner;
  }

  return {
    async plans(actor: Grantee) {
      require(actor, 'vendeurs:consulter');
      return (await shops.listPlans({ activeOnly: false })).map(toPlanDto);
    },

    async createPlan(input: CreatePlanInput, actor: Grantee) {
      require(actor, 'vendeurs:modifier');
      const plan = await shops.createPlan(input);
      if (plan === 'name_taken') throw new ConflictError('Une offre porte déjà ce nom.');
      return toPlanDto(plan);
    },

    /** Une offre n'est jamais supprimée (boutiques et paiements la citent) : on la désactive. */
    async updatePlan(id: string, input: UpdatePlanInput, actor: Grantee) {
      require(actor, 'vendeurs:modifier');
      const current = await shops.findPlan(id);
      if (!current) throw new NotFoundError('Offre introuvable.');
      if (input.kind && input.kind !== current.kind)
        throw new UnprocessableError('Une offre ne change pas de nature : créez une nouvelle offre.');
      const error = planTermsError({ ...current, ...input });
      if (error) throw new UnprocessableError(error);
      const plan = await shops.updatePlan(id, input);
      if (plan === 'name_taken') throw new ConflictError('Une offre porte déjà ce nom.');
      if (!plan) throw new NotFoundError('Offre introuvable.');
      return toPlanDto(plan);
    },

    async settings(actor: Grantee) {
      require(actor, 'vendeurs:consulter');
      return shops.settings();
    },

    async updateSettings(input: Partial<MarketplaceSettingsRecord>, actor: Grantee) {
      require(actor, 'vendeurs:modifier');
      return shops.updateSettings(input);
    },

    async list(query: ListShopsQuery, actor: Grantee) {
      require(actor, 'vendeurs:consulter');
      const { graceDays } = await shops.settings();
      const at = now();
      const { items, total } = await shops.list(query);
      return paginate(
        items.map((shop) => toShopDto(shop, at, graceDays)),
        total,
        query.page,
        query.limit,
      );
    },

    async get(id: string, actor: Grantee) {
      require(actor, 'vendeurs:consulter');
      const shop = await shops.findById(id);
      if (!shop) throw new NotFoundError('Boutique introuvable.');
      return view(shop);
    },

    /** Suspension (annonces masquées immédiatement, vendeur prévenu), réactivation, badge après contrôle humain. */
    async act(id: string, input: ShopActionInput, actor: StaffActor) {
      require(actor, 'vendeurs:valider');
      if (!(await shops.findById(id))) throw new NotFoundError('Boutique introuvable.');
      const at = now();
      let shop: ShopRecord | null;
      switch (input.action) {
        case 'suspend':
          shop = await shops.suspend(id, { reason: input.reason, staffId: actor.id, at });
          if (!shop) throw new ConflictError('Cette boutique est déjà suspendue.');
          break;
        case 'reinstate':
          shop = await shops.reinstate(id);
          if (!shop) throw new ConflictError('Cette boutique n’est pas suspendue.');
          break;
        case 'verify':
        case 'unverify':
          shop = await shops.setVerified(id, input.action === 'verify' ? { staffId: actor.id, at } : null);
          if (!shop) throw new NotFoundError('Boutique introuvable.');
          return view(shop);
      }
      const owner = await ownerOf(shop);
      await notifySeller(deps, owner, suspensionMessage(owner, shop, deps.appUrl));
      return view(shop);
    },

    async payments(query: ListShopPaymentsQuery, actor: Grantee) {
      require(actor, 'vendeurs:consulter');
      const { items, total } = await shops.listPayments(query);
      return paginate(items.map(toPaymentDto), total, query.page, query.limit);
    },

    /** Vérification d'un paiement déclaré : validé, il prolonge l'accès ; refusé, il porte son motif. */
    async decidePayment(id: string, input: PaymentDecisionInput, actor: StaffActor) {
      require(actor, 'vendeurs:valider');
      if (!(await shops.findPayment(id))) throw new NotFoundError('Paiement introuvable.');
      const at = now();
      const payment = await shops.decidePayment(
        id,
        input.status === 'validated'
          ? { validated: true, staffId: actor.id, at }
          : { validated: false, reason: input.reason, staffId: actor.id, at },
      );
      if (payment === 'stale') throw new ConflictError('Ce paiement a déjà été traité.');
      const owner = await ownerOf(payment.shop);
      await notifySeller(deps, owner, paymentDecisionMessage(owner, payment, deps.appUrl));
      return toPaymentDto(payment);
    },
  };
};

export type StaffShopsService = ReturnType<typeof createStaffShopsService>;
