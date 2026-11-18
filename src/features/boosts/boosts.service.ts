import { AppError, ConflictError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { fcfa } from '../../core/text/fcfa.js';
import type { ListingsRepository } from '../listings/listings.repository.js';
import type { Notifier } from '../notifications/notifier.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import type { BoostPlanRecord, BoostRecord, BoostsRepository } from './boosts.repository.js';
import type { BoostsPageQuery, DeclareBoostInput } from './boosts.schemas.js';

export const toBoostPlanDto = (plan: BoostPlanRecord) => plan;

export const toBoostDto = (boost: BoostRecord) => ({
  id: boost.id,
  listing: { id: boost.listing.id, slug: boost.listing.slug, title: boost.listing.title },
  shop: { id: boost.shop.id, name: boost.shop.name },
  plan: boost.plan,
  amount: boost.amount,
  method: boost.method,
  reference: boost.reference,
  status: boost.status,
  decisionReason: boost.decisionReason,
  decidedAt: boost.decidedAt?.toISOString() ?? null,
  startsAt: boost.startsAt?.toISOString() ?? null,
  endsAt: boost.endsAt?.toISOString() ?? null,
  createdAt: boost.createdAt.toISOString(),
});

export interface BoostsDependencies {
  boosts: BoostsRepository;
  listings: ListingsRepository;
  shops: ShopsRepository;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

/**
 * Mise en avant payante d'une annonce dans Okoumé (32.10), côté vendeur. Distincte des campagnes Facebook et
 * Instagram : l'annonce est marquée « Sponsorisé » dans la recherche d'Okoumé, rien n'est publié ailleurs.
 */
export const createBoostsService = ({ boosts, listings, shops, notifier, appUrl }: BoostsDependencies) => ({
  async plans() {
    return (await boosts.listPlans({ activeOnly: true })).map(toBoostPlanDto);
  },

  /**
   * Déclaration du paiement d'une mise en avant : rien n'est actif avant la validation de l'administration. Le
   * montant doit être celui de l'offre ; une référence déjà déclarée (abonnement ou mise en avant) est refusée.
   */
  async declare(customerId: string, listingId: string, input: DeclareBoostInput) {
    const listing = await listings.findById(listingId);
    if (!listing || listing.shop.ownerId !== customerId) throw new NotFoundError('Annonce introuvable.');
    if (listing.shop.status === 'suspended')
      throw new ConflictError('Votre boutique est suspendue : ses annonces ne peuvent pas être mises en avant.');
    if (listing.status !== 'published') throw new ConflictError('Seule une annonce publiée peut être mise en avant.');
    const plan = await boosts.findPlan(input.planId);
    if (!plan?.active) throw new UnprocessableError('Cette offre n’est plus proposée.');
    if (input.amount !== plan.price)
      throw new UnprocessableError(`Le montant de l’offre « ${plan.name} » est de ${fcfa(plan.price)}.`);
    const referenceTaken = () =>
      new AppError('Cette référence de transaction a déjà été déclarée.', 409, 'PAYMENT_REFERENCE_USED');
    if (await shops.paymentReferenceUsed(input.method, input.reference)) throw referenceTaken();
    const result = await boosts.declare({
      listingId: listing.id,
      shopId: listing.shop.id,
      planId: plan.id,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
    });
    if (result === 'pending_exists')
      throw new ConflictError('Une mise en avant de cette annonce attend déjà sa vérification.');
    if (result === 'reference_used') throw referenceTaken();
    await notifier.notifyStaff('vendeurs:valider', {
      title: 'Mise en avant à vérifier',
      body: `${listing.title} : ${fcfa(input.amount)}`,
      url: `${appUrl}/admin/boutiques/mises-en-avant`,
      tag: `mise-en-avant-${result.id}`,
    });
    return toBoostDto(result);
  },

  async mine(customerId: string, query: BoostsPageQuery) {
    const shop = await shops.findByOwner(customerId);
    if (!shop) throw new NotFoundError('Ouvrez d’abord votre boutique.');
    const { items, total } = await boosts.list({ shopId: shop.id, page: query.page, limit: query.limit });
    return paginate(items.map(toBoostDto), total, query.page, query.limit);
  },
});

export type BoostsService = ReturnType<typeof createBoostsService>;
