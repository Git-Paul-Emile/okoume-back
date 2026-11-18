import { randomUUID } from 'node:crypto';
import type { BoostPlanRecord, BoostRecord, BoostsRepository } from '../src/features/boosts/boosts.repository.js';
import type { ListingsRepository } from '../src/features/listings/listings.repository.js';
import { nextPeriod } from '../src/features/shops/shops.rules.js';

type Stored = Omit<BoostRecord, 'listing' | 'shop' | 'plan'> & { listingId: string; shopId: string; planId: string };

/**
 * Mises en avant en mémoire, même contrat que Prisma : une en attente par annonce, une référence utilisée une fois
 * (hors refus), une période validée qui suit la mise en avant en cours.
 */
export function createMemoryBoosts(store: { listings: ListingsRepository; now: () => Date }) {
  const plans: BoostPlanRecord[] = [];
  const boosts: Stored[] = [];

  async function toBoost({ listingId, shopId: _s, planId, ...boost }: Stored): Promise<BoostRecord> {
    const listing = await store.listings.findById(listingId);
    const plan = plans.find((p) => p.id === planId);
    if (!listing || !plan) throw new Error('Annonce ou offre absente');
    return {
      ...boost,
      listing: { id: listing.id, slug: listing.slug, title: listing.title },
      shop: { id: listing.shop.id, name: listing.shop.name, ownerId: listing.shop.ownerId },
      plan: { id: plan.id, name: plan.name, durationDays: plan.durationDays },
    };
  }

  const repository: BoostsRepository = {
    async listPlans({ activeOnly }) {
      return plans.filter((p) => !activeOnly || p.active).sort((a, b) => a.position - b.position);
    },
    async findPlan(id) {
      return plans.find((p) => p.id === id) ?? null;
    },
    async createPlan(fields) {
      if (plans.some((p) => p.name === fields.name)) return 'name_taken';
      const plan = { id: randomUUID(), ...fields };
      plans.push(plan);
      return plan;
    },
    async updatePlan(id, fields) {
      const plan = plans.find((p) => p.id === id);
      if (!plan) return null;
      if (fields.name && plans.some((p) => p.id !== id && p.name === fields.name)) return 'name_taken';
      Object.assign(plan, fields);
      return plan;
    },
    async declare(boost) {
      if (boosts.some((b) => b.listingId === boost.listingId && b.status === 'pending')) return 'pending_exists';
      if (await repository.referenceUsed(boost.method, boost.reference)) return 'reference_used';
      const stored: Stored = {
        id: randomUUID(),
        ...boost,
        status: 'pending',
        decisionReason: null,
        decidedAt: null,
        startsAt: null,
        endsAt: null,
        createdAt: store.now(),
      };
      boosts.push(stored);
      return toBoost(stored);
    },
    async findById(id) {
      const boost = boosts.find((b) => b.id === id);
      return boost ? toBoost(boost) : null;
    },
    async list({ status, shopId, page, limit }) {
      const found = boosts.filter((b) => (!status || b.status === status) && (!shopId || b.shopId === shopId));
      return {
        items: await Promise.all(found.slice((page - 1) * limit, page * limit).map(toBoost)),
        total: found.length,
      };
    },
    async decide(id, decision) {
      const boost = boosts.find((b) => b.id === id);
      if (boost?.status !== 'pending') return 'stale';
      if (!decision.validated) {
        Object.assign(boost, { status: 'refused', decisionReason: decision.reason, decidedAt: decision.at });
        return toBoost(boost);
      }
      const current = boosts
        .filter(
          (b) => b.listingId === boost.listingId && b.status === 'validated' && b.endsAt && b.endsAt > decision.at,
        )
        .sort((a, b) => b.endsAt!.getTime() - a.endsAt!.getTime())[0];
      const plan = plans.find((p) => p.id === boost.planId)!;
      const period = nextPeriod(current?.endsAt ?? null, decision.at, plan.durationDays);
      Object.assign(boost, { status: 'validated', decidedAt: decision.at, startsAt: period.start, endsAt: period.end });
      return toBoost(boost);
    },
    async referenceUsed(method, reference) {
      return boosts.some((b) => b.method === method && b.reference === reference && b.status !== 'refused');
    },
  };

  /** Mise en avant validée et en cours pour cette annonce, comme la requête de recherche. */
  const isActive = (listingId: string, at: Date) =>
    boosts.some(
      (b) =>
        b.listingId === listingId &&
        b.status === 'validated' &&
        b.startsAt !== null &&
        b.endsAt !== null &&
        b.startsAt <= at &&
        b.endsAt > at,
    );

  return { repository, plans, boosts, isActive };
}
