import { AppError, ConflictError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { randomReadableCode } from '../../core/security/secrets.js';
import { fcfa } from '../../core/text/fcfa.js';
import { slugify } from '../../core/text/slugify.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import { logger } from '../../lib/logger.js';
import type { Notifier } from '../notifications/notifier.js';
import { toPaymentDto, toPlanDto, toPublicShopDto, toShopDto } from './shops.dto.js';
import { accessReminderMessage, type SellerMessage } from './shops.emails.js';
import type { OwnerRecord, ShopRecord, ShopsRepository } from './shops.repository.js';
import { accessState, addDays, isVisible, reminderDue } from './shops.rules.js';
import type { DeclarePaymentInput, OpenShopInput, PageQuery, UpdateShopInput } from './shops.schemas.js';

const SLUG_ATTEMPTS = 5;

export interface ShopsDependencies {
  shops: ShopsRepository;
  email: EmailSender;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

/**
 * Prévient un client (vendeur, ou acheteur avec le sujet « orders ») : e-mail obligatoire, notification selon ses
 * réglages. Un échec de dépôt est journalisé sans défaire l'action déjà enregistrée.
 */
export async function notifySeller(
  { email, notifier }: Pick<ShopsDependencies, 'email' | 'notifier'>,
  owner: Pick<OwnerRecord, 'id'>,
  message: SellerMessage,
  topic: 'shop' | 'orders' = 'shop',
) {
  try {
    await email.send(message.email);
  } catch (err) {
    logger.error({ err, customerId: owner.id }, 'E-mail au vendeur non déposé');
  }
  await notifier.notifyCustomer(owner.id, topic, message.push);
}

/** Boutique du vendeur tiers connecté, offres d'accès et fiche publique (cahier des charges, 32.2). */
export const createShopsService = (deps: ShopsDependencies) => {
  const { shops, notifier, now } = deps;

  async function own(customerId: string) {
    const shop = await shops.findByOwner(customerId);
    if (!shop) throw new NotFoundError('Vous n’avez pas encore de boutique.');
    return shop;
  }

  async function view(shop: ShopRecord) {
    const { graceDays } = await shops.settings();
    return toShopDto(shop, now(), graceDays);
  }

  async function activePlan(planId: string) {
    const plan = await shops.findPlan(planId);
    if (!plan?.active) throw new UnprocessableError('Cette offre n’est plus proposée.');
    return plan;
  }

  return {
    /** Offres proposées à l'ouverture et au renouvellement. */
    async plans() {
      return (await shops.listPlans({ activeOnly: true })).map(toPlanDto);
    },

    /**
     * Ouverture d'une boutique, une par compte, réservée aux comptes à l'adresse e-mail vérifiée. Une offre
     * payante avec essai démarre l'essai ; sans essai, la boutique attend le premier paiement validé.
     */
    async open(customerId: string, input: OpenShopInput) {
      const owner = await shops.findOwner(customerId);
      if (owner?.status !== 'active')
        throw new UnprocessableError('Confirmez votre adresse e-mail avant d’ouvrir une boutique.');
      const plan = await activePlan(input.planId);
      const at = now();
      const trial = plan.kind === 'paid' && plan.trialDays > 0;
      const base = slugify(input.name) || 'boutique';
      for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
        const result = await shops.create({
          ownerId: customerId,
          slug: attempt === 0 ? base : `${base}-${randomReadableCode(4).toLowerCase()}`,
          name: input.name,
          description: input.description,
          city: input.city,
          district: input.district,
          latitude: input.position?.latitude ?? null,
          longitude: input.position?.longitude ?? null,
          phone: input.phone,
          acceptedPaymentMethods: input.acceptedPaymentMethods,
          handoverModes: input.handoverModes,
          planId: plan.id,
          accessEndsAt: trial ? addDays(at, plan.trialDays) : null,
          inTrial: trial,
        });
        if (result === 'owner_taken') throw new ConflictError('Vous avez déjà une boutique.');
        if (result !== 'slug_taken') return view(result);
      }
      throw new Error('Impossible d’attribuer une adresse unique à la boutique.');
    },

    async mine(customerId: string) {
      const shop = await own(customerId);
      const pending = await shops.listPayments({ shopId: shop.id, status: 'pending', page: 1, limit: 1 });
      return { ...(await view(shop)), pendingPayment: pending.items[0] ? toPaymentDto(pending.items[0]) : null };
    },

    /** L'adresse publique (slug) ne change pas avec le nom : les liens déjà partagés restent valables. */
    async update(customerId: string, input: UpdateShopInput) {
      const shop = await own(customerId);
      const { position, ...fields } = input;
      const updated = await shops.update(shop.id, {
        ...fields,
        ...(position !== undefined
          ? { latitude: position?.latitude ?? null, longitude: position?.longitude ?? null }
          : {}),
      });
      return view(updated);
    },

    /** Passage direct sur une offre gratuite. Une offre payante s'active par un paiement validé. */
    async changePlan(customerId: string, planId: string) {
      const shop = await own(customerId);
      const plan = await activePlan(planId);
      if (plan.kind !== 'free')
        throw new UnprocessableError('Une offre payante s’active par un paiement validé : déclarez votre paiement.');
      if (shop.plan.id === plan.id) return view(shop);
      return view(await shops.changePlan(shop.id, plan.id));
    },

    /**
     * Déclaration d'un paiement Mobile Money fait hors plateforme (32.2, 8.4) : il n'ouvre aucun accès avant la
     * validation de l'administration. Le montant doit être celui de l'offre, pour une vérification sans ambiguïté.
     */
    async declarePayment(customerId: string, input: DeclarePaymentInput) {
      const shop = await own(customerId);
      if (shop.status === 'suspended')
        throw new ConflictError('Votre boutique est suspendue : contactez l’administration avant de payer.');
      const plan = await activePlan(input.planId);
      if (plan.kind !== 'paid') throw new UnprocessableError('Cette offre est gratuite : aucun paiement à déclarer.');
      if (input.amount !== plan.price)
        throw new UnprocessableError(`Le montant de l’offre « ${plan.name} » est de ${fcfa(plan.price)}.`);
      const result = await shops.declarePayment({
        shopId: shop.id,
        planId: plan.id,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
      });
      if (result === 'pending_exists')
        throw new ConflictError('Un paiement attend déjà sa vérification : patientez avant d’en déclarer un autre.');
      if (result === 'reference_used')
        throw new AppError('Cette référence de transaction a déjà été déclarée.', 409, 'PAYMENT_REFERENCE_USED');
      await notifier.notifyStaff('vendeurs:valider', {
        title: 'Paiement de boutique à vérifier',
        body: `${shop.name} : ${fcfa(input.amount)}`,
        url: `${deps.appUrl}/admin/boutiques/paiements`,
        tag: `paiement-boutique-${result.id}`,
      });
      return toPaymentDto(result);
    },

    async payments(customerId: string, query: PageQuery) {
      const shop = await own(customerId);
      const { items, total } = await shops.listPayments({ shopId: shop.id, page: query.page, limit: query.limit });
      return paginate(items.map(toPaymentDto), total, query.page, query.limit);
    },

    /** Fiche publique : une boutique suspendue ou sans accès en cours répond 404, comme une boutique inconnue. */
    async publicShop(slug: string) {
      const shop = await shops.findBySlug(slug);
      const { graceDays } = await shops.settings();
      const state = shop
        ? accessState(
            { status: shop.status, planKind: shop.plan.kind, accessEndsAt: shop.accessEndsAt, inTrial: shop.inTrial },
            now(),
            graceDays,
          )
        : null;
      if (!shop || !state || !isVisible(state)) throw new NotFoundError('Boutique introuvable.');
      return toPublicShopDto(shop);
    },

    /** Annuaire public : uniquement les boutiques dont l'offre est actuellement visible. */
    async publicList(query: PageQuery) {
      const { graceDays } = await shops.settings();
      const { items, total } = await shops.listPublic({ ...query, now: now(), graceDays });
      return paginate(items.map(toPublicShopDto), total, query.page, query.limit);
    },

    /** Rappels d'échéance du jour (job quotidien) : un seul par échéance, même si le job est rejoué. */
    async sendAccessReminders() {
      const at = now();
      const { reminderDays } = await shops.settings();
      let sent = 0;
      for (const shop of await shops.endingSoon(at, reminderDays)) {
        if (!reminderDue({ ...shop, planKind: shop.plan.kind }, at, reminderDays) || !shop.accessEndsAt) continue;
        if (!(await shops.markReminded(shop.id, shop.accessEndsAt))) continue;
        const owner = await shops.findOwner(shop.ownerId);
        if (!owner) continue;
        await notifySeller(deps, owner, accessReminderMessage(owner, shop, deps.appUrl));
        sent++;
      }
      return sent;
    },
  };
};

export type ShopsService = ReturnType<typeof createShopsService>;
