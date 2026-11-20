import { randomUUID } from 'node:crypto';
import type {
  AccessPlanRecord,
  MarketplaceSettingsRecord,
  OwnerRecord,
  ShopPaymentRecord,
  ShopRecord,
  ShopsRepository,
} from '../src/features/shops/shops.repository.js';
import { addDays, nextPeriod } from '../src/features/shops/shops.rules.js';

type StoredShop = Omit<ShopRecord, 'plan'> & { planId: string };
type StoredPayment = Omit<ShopPaymentRecord, 'shop' | 'plan'> & { shopId: string; planId: string };

/**
 * Offres, boutiques et paiements en mémoire, même contrat que Prisma : une boutique par compte, un paiement en
 * attente par boutique, une référence de transaction utilisée une fois (hors refus), décision gardée.
 */
export function createMemoryShops(now: () => Date) {
  const plans: AccessPlanRecord[] = [];
  const shops: StoredShop[] = [];
  const payments: StoredPayment[] = [];
  const owners = new Map<string, OwnerRecord>();
  const settings: MarketplaceSettingsRecord = {
    graceDays: 3,
    commissionRate: 0,
    reminderDays: 5,
    aiReviewMonthlyLimit: 1000,
    agreementValidityHours: 48,
    aiChatMonthlyLimit: 5000,
  };

  const planOf = (id: string) => {
    const plan = plans.find((p) => p.id === id);
    if (!plan) throw new Error(`Offre ${id} absente`);
    return plan;
  };
  const toShop = ({ planId, ...shop }: StoredShop): ShopRecord => ({ ...shop, plan: { ...planOf(planId) } });
  const toPayment = ({ shopId, planId, ...payment }: StoredPayment): ShopPaymentRecord => {
    const shop = shops.find((s) => s.id === shopId)!;
    const plan = planOf(planId);
    return {
      ...payment,
      shop: { id: shop.id, name: shop.name, ownerId: shop.ownerId },
      plan: { id: plan.id, name: plan.name },
    };
  };
  const page = <T>(items: T[], p: number, limit: number) => ({
    items: items.slice((p - 1) * limit, p * limit),
    total: items.length,
  });

  const repository: ShopsRepository = {
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

    async findOwner(customerId) {
      return owners.get(customerId) ?? null;
    },
    async findByOwner(customerId) {
      const shop = shops.find((s) => s.ownerId === customerId);
      return shop ? toShop(shop) : null;
    },
    async findById(id) {
      const shop = shops.find((s) => s.id === id);
      return shop ? toShop(shop) : null;
    },
    async findBySlug(slug) {
      const shop = shops.find((s) => s.slug === slug);
      return shop ? toShop(shop) : null;
    },
    async create(fields) {
      if (shops.some((s) => s.ownerId === fields.ownerId)) return 'owner_taken';
      if (shops.some((s) => s.slug === fields.slug)) return 'slug_taken';
      const shop: StoredShop = {
        id: randomUUID(),
        ...fields,
        status: 'active',
        suspensionReason: null,
        suspendedAt: null,
        verifiedAt: null,
        reminderSentFor: null,
        createdAt: now(),
      };
      shops.push(shop);
      return toShop(shop);
    },
    async update(id, fields) {
      const shop = shops.find((s) => s.id === id)!;
      Object.assign(shop, fields);
      return toShop(shop);
    },
    async changePlan(id, planId) {
      const shop = shops.find((s) => s.id === id)!;
      Object.assign(shop, { planId, accessEndsAt: null, inTrial: false, reminderSentFor: null });
      return toShop(shop);
    },
    async list({ status, search, page: p, limit }) {
      const term = search?.toLowerCase();
      const found = shops
        .filter((s) => !status || s.status === status)
        .filter((s) => !term || s.name.toLowerCase().includes(term) || s.city.toLowerCase().includes(term))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(toShop);
      return page(found, p, limit);
    },
    async suspend(id, { reason, at }) {
      const shop = shops.find((s) => s.id === id && s.status === 'active');
      if (!shop) return null;
      Object.assign(shop, { status: 'suspended', suspensionReason: reason, suspendedAt: at });
      return toShop(shop);
    },
    async reinstate(id) {
      const shop = shops.find((s) => s.id === id && s.status === 'suspended');
      if (!shop) return null;
      Object.assign(shop, { status: 'active', suspensionReason: null, suspendedAt: null });
      return toShop(shop);
    },
    async setVerified(id, by) {
      const shop = shops.find((s) => s.id === id);
      if (!shop) return null;
      shop.verifiedAt = by ? by.at : null;
      return toShop(shop);
    },

    async declarePayment(fields) {
      if (payments.some((p) => p.shopId === fields.shopId && p.status === 'pending')) return 'pending_exists';
      if (
        payments.some((p) => p.method === fields.method && p.reference === fields.reference && p.status !== 'refused')
      )
        return 'reference_used';
      const payment: StoredPayment = {
        id: randomUUID(),
        ...fields,
        status: 'pending',
        decisionReason: null,
        decidedAt: null,
        periodStart: null,
        periodEnd: null,
        createdAt: now(),
      };
      payments.push(payment);
      return toPayment(payment);
    },
    async paymentReferenceUsed(method, reference) {
      return payments.some((p) => p.method === method && p.reference === reference && p.status !== 'refused');
    },
    async listPayments({ status, shopId, page: p, limit }) {
      const found = payments
        .filter((x) => (!status || x.status === status) && (!shopId || x.shopId === shopId))
        .map(toPayment);
      return page(found, p, limit);
    },
    async findPayment(id) {
      const payment = payments.find((p) => p.id === id);
      return payment ? toPayment(payment) : null;
    },
    async decidePayment(id, decision) {
      const payment = payments.find((p) => p.id === id);
      if (payment?.status !== 'pending') return 'stale';
      if (!decision.validated) {
        Object.assign(payment, { status: 'refused', decisionReason: decision.reason, decidedAt: decision.at });
        return toPayment(payment);
      }
      const shop = shops.find((s) => s.id === payment.shopId)!;
      const period = nextPeriod(shop.accessEndsAt, decision.at, planOf(payment.planId).periodDays!);
      Object.assign(payment, {
        status: 'validated',
        decidedAt: decision.at,
        periodStart: period.start,
        periodEnd: period.end,
      });
      Object.assign(shop, { planId: payment.planId, accessEndsAt: period.end, inTrial: false, reminderSentFor: null });
      return toPayment(payment);
    },

    async settings() {
      return { ...settings };
    },
    async updateSettings(patch) {
      Object.assign(settings, patch);
      return { ...settings };
    },
    async endingSoon(at, reminderDays) {
      return shops
        .filter((s) => s.status === 'active' && planOf(s.planId).kind === 'paid')
        .filter((s) => s.accessEndsAt && s.accessEndsAt > at && s.accessEndsAt <= addDays(at, reminderDays))
        .map(toShop);
    },
    async markReminded(id, endsAt) {
      const shop = shops.find((s) => s.id === id && s.accessEndsAt?.getTime() === endsAt.getTime());
      if (!shop || shop.reminderSentFor?.getTime() === endsAt.getTime()) return false;
      shop.reminderSentFor = endsAt;
      return true;
    },
  };

  /** Compte client propriétaire potentiel ; actif (adresse vérifiée) par défaut. */
  const addOwner = (owner: Partial<OwnerRecord> = {}) => {
    const record: OwnerRecord = {
      id: randomUUID(),
      email: `vendeur${owners.size + 1}@example.ga`,
      firstName: 'Awa',
      status: 'active',
      ...owner,
    };
    owners.set(record.id, record);
    return record;
  };

  return { repository, plans, shops, payments, addOwner };
}
