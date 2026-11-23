import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { addDays, nextPeriod } from './shops.rules.js';

export interface AccessPlanRecord {
  id: string;
  name: string;
  description: string;
  kind: 'free' | 'paid';
  price: number;
  periodDays: number | null;
  trialDays: number;
  active: boolean;
  position: number;
}

export type PlanFields = Omit<AccessPlanRecord, 'id'>;

export interface ShopRecord {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  description: string;
  city: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  acceptedPaymentMethods: Array<'cash' | 'airtel' | 'moov'>;
  handoverModes: Array<'pickup' | 'seller_delivery'>;
  plan: AccessPlanRecord;
  accessEndsAt: Date | null;
  inTrial: boolean;
  status: 'active' | 'suspended';
  suspensionReason: string | null;
  suspendedAt: Date | null;
  verifiedAt: Date | null;
  reminderSentFor: Date | null;
  createdAt: Date;
}

/** Champs que le vendeur renseigne lui-même. */
export type ShopFields = Pick<
  ShopRecord,
  | 'name'
  | 'description'
  | 'city'
  | 'district'
  | 'latitude'
  | 'longitude'
  | 'phone'
  | 'acceptedPaymentMethods'
  | 'handoverModes'
>;

export type NewShop = ShopFields &
  Pick<ShopRecord, 'ownerId' | 'slug' | 'accessEndsAt' | 'inTrial'> & { planId: string };

export interface OwnerRecord {
  id: string;
  email: string;
  firstName: string;
  status: 'pending_verification' | 'active' | 'anonymized';
}

export interface ShopPaymentRecord {
  id: string;
  shop: { id: string; name: string; ownerId: string };
  plan: { id: string; name: string };
  amount: number;
  method: 'airtel' | 'moov';
  reference: string;
  status: 'pending' | 'validated' | 'refused';
  decisionReason: string | null;
  decidedAt: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date;
}

export interface NewShopPayment {
  shopId: string;
  planId: string;
  amount: number;
  method: 'airtel' | 'moov';
  reference: string;
}

export type PaymentDecision =
  { validated: true; staffId: string; at: Date } | { validated: false; reason: string; staffId: string; at: Date };

export interface MarketplaceSettingsRecord {
  graceDays: number;
  reminderDays: number;
  /** Vérifications d'annonces par IA par mois (16.6) ; au-delà, modération humaine */
  aiReviewMonthlyLimit: number;
  /** Validité d'un prix convenu dans le tchat, en heures (32.5) */
  agreementValidityHours: number;
  /** Réponses du négociateur IA par mois (16.6) ; au-delà, le vendeur répond lui-même */
  aiChatMonthlyLimit: number;
  /** Commission d'OKOZA sur les ventes des vendeurs, en pourcentage (32.6) */
  commissionRate: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

/** Contrat des offres d'accès, des boutiques de vendeurs tiers et des paiements de leurs abonnements (32.2). */
export interface ShopsRepository {
  listPlans(filter: { activeOnly: boolean }): Promise<AccessPlanRecord[]>;
  findPlan(id: string): Promise<AccessPlanRecord | null>;
  createPlan(fields: PlanFields): Promise<AccessPlanRecord | 'name_taken'>;
  /** null : offre introuvable. */
  updatePlan(id: string, fields: Partial<PlanFields>): Promise<AccessPlanRecord | 'name_taken' | null>;

  findOwner(customerId: string): Promise<OwnerRecord | null>;
  findByOwner(customerId: string): Promise<ShopRecord | null>;
  findById(id: string): Promise<ShopRecord | null>;
  findBySlug(slug: string): Promise<ShopRecord | null>;
  /** Boutiques actives dont l'offre est visible au public. */
  listPublic(query: { page: number; limit: number; now: Date; graceDays: number }): Promise<Page<ShopRecord>>;
  create(shop: NewShop): Promise<ShopRecord | 'owner_taken' | 'slug_taken'>;
  update(id: string, fields: Partial<ShopFields>): Promise<ShopRecord>;
  /** Changement d'offre direct (offre gratuite) : la période en cours s'arrête. */
  changePlan(id: string, planId: string): Promise<ShopRecord>;
  list(query: {
    status?: ShopRecord['status'] | undefined;
    search?: string | undefined;
    page: number;
    limit: number;
  }): Promise<Page<ShopRecord>>;
  /** null : la boutique n'était pas dans l'état attendu (déjà suspendue, ou déjà active). */
  suspend(id: string, change: { reason: string; staffId: string; at: Date }): Promise<ShopRecord | null>;
  reinstate(id: string): Promise<ShopRecord | null>;
  setVerified(id: string, by: { staffId: string; at: Date } | null): Promise<ShopRecord | null>;

  declarePayment(payment: NewShopPayment): Promise<ShopPaymentRecord | 'pending_exists' | 'reference_used'>;
  /** Référence de transaction déjà déclarée pour un abonnement (hors refus). */
  paymentReferenceUsed(method: 'airtel' | 'moov', reference: string): Promise<boolean>;
  listPayments(query: {
    status?: ShopPaymentRecord['status'] | undefined;
    shopId?: string | undefined;
    page: number;
    limit: number;
  }): Promise<Page<ShopPaymentRecord>>;
  findPayment(id: string): Promise<ShopPaymentRecord | null>;
  /**
   * Décision sur un paiement en attente, dans une transaction. Validé : la boutique passe sur l'offre payée et
   * sa période est prolongée (nextPeriod). « stale » : le paiement n'est plus en attente.
   */
  decidePayment(id: string, decision: PaymentDecision): Promise<ShopPaymentRecord | 'stale'>;

  settings(): Promise<MarketplaceSettingsRecord>;
  updateSettings(patch: Partial<MarketplaceSettingsRecord>): Promise<MarketplaceSettingsRecord>;
  /** Boutiques payantes dont l'accès finit dans les reminderDays jours ; le filtre fin est fait par reminderDue. */
  endingSoon(now: Date, reminderDays: number): Promise<ShopRecord[]>;
  /** true la première fois pour cette échéance : un seul rappel par échéance, même si le job est rejoué. */
  markReminded(id: string, endsAt: Date): Promise<boolean>;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const planColumns = {
  id: true,
  name: true,
  description: true,
  kind: true,
  price: true,
  periodDays: true,
  trialDays: true,
  active: true,
  position: true,
} as const satisfies Prisma.AccessPlanSelect;

const toPlan = (row: Prisma.AccessPlanGetPayload<{ select: typeof planColumns }>): AccessPlanRecord => ({
  ...row,
  price: row.price.toNumber(),
});

const shopInclude = { plan: { select: planColumns } } as const satisfies Prisma.ShopInclude;
type ShopRow = Prisma.ShopGetPayload<{ include: typeof shopInclude }>;

const toShop = ({
  plan,
  latitude,
  longitude,
  planId: _planId,
  suspendedById: _suspendedBy,
  verifiedById: _verifiedBy,
  updatedAt: _updatedAt,
  ...shop
}: ShopRow): ShopRecord => ({
  ...shop,
  latitude: latitude?.toNumber() ?? null,
  longitude: longitude?.toNumber() ?? null,
  plan: toPlan(plan),
});

const paymentInclude = {
  shop: { select: { id: true, name: true, ownerId: true } },
  plan: { select: { id: true, name: true } },
} as const satisfies Prisma.ShopPaymentInclude;
type PaymentRow = Prisma.ShopPaymentGetPayload<{ include: typeof paymentInclude }>;

/** Le moyen « espèces » est exclu par la base (shop_payments_mobile_money) : seuls airtel et moov reviennent. */
function toPayment({ planId: _p, shopId: _s, decidedById: _d, amount, method, ...row }: PaymentRow): ShopPaymentRecord {
  if (method === 'cash') throw new Error(`Paiement de boutique ${row.id} en espèces : contrainte de base absente`);
  return { ...row, method, amount: amount.toNumber() };
}

const settingsOf = (row: Prisma.MarketplaceSettingsGetPayload<object>): MarketplaceSettingsRecord => ({
  graceDays: row.graceDays,
  reminderDays: row.reminderDays,
  aiReviewMonthlyLimit: row.aiReviewMonthlyLimit,
  agreementValidityHours: row.agreementValidityHours,
  aiChatMonthlyLimit: row.aiChatMonthlyLimit,
  commissionRate: row.commissionRate.toNumber(),
});

export const shopsRepository: ShopsRepository = {
  async listPlans({ activeOnly }) {
    const rows = await prisma.accessPlan.findMany({
      where: activeOnly ? { active: true } : {},
      select: planColumns,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toPlan);
  },

  async findPlan(id) {
    const row = await prisma.accessPlan.findUnique({ where: { id }, select: planColumns });
    return row ? toPlan(row) : null;
  },

  async createPlan(fields) {
    try {
      return toPlan(await prisma.accessPlan.create({ data: fields, select: planColumns }));
    } catch (error) {
      if (isUniqueViolation(error)) return 'name_taken';
      throw error;
    }
  },

  async updatePlan(id, fields) {
    try {
      const updated = await prisma.accessPlan.updateMany({ where: { id }, data: fields });
      if (!updated.count) return null;
      return toPlan(await prisma.accessPlan.findUniqueOrThrow({ where: { id }, select: planColumns }));
    } catch (error) {
      if (isUniqueViolation(error)) return 'name_taken';
      throw error;
    }
  },

  findOwner: (customerId) =>
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, email: true, firstName: true, status: true },
    }),

  async findByOwner(customerId) {
    const row = await prisma.shop.findUnique({ where: { ownerId: customerId }, include: shopInclude });
    return row ? toShop(row) : null;
  },

  async findById(id) {
    const row = await prisma.shop.findUnique({ where: { id }, include: shopInclude });
    return row ? toShop(row) : null;
  },

  async findBySlug(slug) {
    const row = await prisma.shop.findUnique({ where: { slug }, include: shopInclude });
    return row ? toShop(row) : null;
  },

  async listPublic({ page, limit, now, graceDays }) {
    const where: Prisma.ShopWhereInput = {
      status: 'active',
      OR: [
        { plan: { is: { kind: 'free' } } },
        { accessEndsAt: { gt: addDays(now, -graceDays) } },
      ],
    };
    const [rows, total] = await prisma.$transaction([
      prisma.shop.findMany({
        where,
        include: shopInclude,
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shop.count({ where }),
    ]);
    return { items: rows.map(toShop), total };
  },

  /** Les doublons sont vérifiés avant l'écriture ; une course entre deux ouvertures finit sur l'index unique. */
  async create(shop) {
    if (await prisma.shop.findUnique({ where: { ownerId: shop.ownerId }, select: { id: true } })) return 'owner_taken';
    if (await prisma.shop.findUnique({ where: { slug: shop.slug }, select: { id: true } })) return 'slug_taken';
    try {
      return toShop(await prisma.shop.create({ data: shop, include: shopInclude }));
    } catch (error) {
      if (isUniqueViolation(error)) return 'slug_taken';
      throw error;
    }
  },

  async update(id, fields) {
    return toShop(await prisma.shop.update({ where: { id }, data: fields, include: shopInclude }));
  },

  async changePlan(id, planId) {
    return toShop(
      await prisma.shop.update({
        where: { id },
        data: { planId, accessEndsAt: null, inTrial: false, reminderSentFor: null },
        include: shopInclude,
      }),
    );
  },

  async list({ status, search, page, limit }) {
    const where: Prisma.ShopWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
              { owner: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.shop.findMany({
        where,
        include: shopInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shop.count({ where }),
    ]);
    return { items: rows.map(toShop), total };
  },

  async suspend(id, { reason, staffId, at }) {
    const { count } = await prisma.shop.updateMany({
      where: { id, status: 'active' },
      data: { status: 'suspended', suspensionReason: reason, suspendedAt: at, suspendedById: staffId },
    });
    return count ? shopsRepository.findById(id) : null;
  },

  async reinstate(id) {
    const { count } = await prisma.shop.updateMany({
      where: { id, status: 'suspended' },
      data: { status: 'active', suspensionReason: null, suspendedAt: null, suspendedById: null },
    });
    return count ? shopsRepository.findById(id) : null;
  },

  async setVerified(id, by) {
    const { count } = await prisma.shop.updateMany({
      where: { id },
      data: by ? { verifiedAt: by.at, verifiedById: by.staffId } : { verifiedAt: null, verifiedById: null },
    });
    return count ? shopsRepository.findById(id) : null;
  },

  async declarePayment(payment) {
    const pending = await prisma.shopPayment.findFirst({
      where: { shopId: payment.shopId, status: 'pending' },
      select: { id: true },
    });
    if (pending) return 'pending_exists';
    const used = await prisma.shopPayment.findFirst({
      where: { method: payment.method, reference: payment.reference, status: { not: 'refused' } },
      select: { id: true },
    });
    if (used) return 'reference_used';
    try {
      return toPayment(await prisma.shopPayment.create({ data: payment, include: paymentInclude }));
    } catch (error) {
      // Course avec une autre déclaration : l'un des deux index uniques partiels a tranché
      if (isUniqueViolation(error)) return 'pending_exists';
      throw error;
    }
  },

  async paymentReferenceUsed(method, reference) {
    const used = await prisma.shopPayment.findFirst({
      where: { method, reference, status: { not: 'refused' } },
      select: { id: true },
    });
    return used !== null;
  },

  async listPayments({ status, shopId, page, limit }) {
    const where: Prisma.ShopPaymentWhereInput = { ...(status ? { status } : {}), ...(shopId ? { shopId } : {}) };
    const [rows, total] = await prisma.$transaction([
      prisma.shopPayment.findMany({
        where,
        include: paymentInclude,
        orderBy: { createdAt: status === 'pending' ? 'asc' : 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shopPayment.count({ where }),
    ]);
    return { items: rows.map(toPayment), total };
  },

  async findPayment(id) {
    const row = await prisma.shopPayment.findUnique({ where: { id }, include: paymentInclude });
    return row ? toPayment(row) : null;
  },

  async decidePayment(id, decision) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.shopPayment.findUnique({
        where: { id },
        select: { status: true, shopId: true, planId: true, plan: { select: { periodDays: true } } },
      });
      if (payment?.status !== 'pending') return 'stale';
      if (!decision.validated) {
        const { count } = await tx.shopPayment.updateMany({
          where: { id, status: 'pending' },
          data: {
            status: 'refused',
            decisionReason: decision.reason,
            decidedById: decision.staffId,
            decidedAt: decision.at,
          },
        });
        if (!count) return 'stale';
      } else {
        if (!payment.plan.periodDays) throw new Error(`Paiement ${id} sur une offre sans période`);
        const shop = await tx.shop.findUniqueOrThrow({
          where: { id: payment.shopId },
          select: { accessEndsAt: true },
        });
        const period = nextPeriod(shop.accessEndsAt, decision.at, payment.plan.periodDays);
        const { count } = await tx.shopPayment.updateMany({
          where: { id, status: 'pending' },
          data: {
            status: 'validated',
            decidedById: decision.staffId,
            decidedAt: decision.at,
            periodStart: period.start,
            periodEnd: period.end,
          },
        });
        if (!count) return 'stale';
        await tx.shop.update({
          where: { id: payment.shopId },
          data: { planId: payment.planId, accessEndsAt: period.end, inTrial: false, reminderSentFor: null },
          select: { id: true },
        });
      }
      return toPayment(await tx.shopPayment.findUniqueOrThrow({ where: { id }, include: paymentInclude }));
    });
  },

  async settings() {
    const row = await prisma.marketplaceSettings.findUniqueOrThrow({ where: { id: 1 } });
    return settingsOf(row);
  },

  async updateSettings(patch) {
    return settingsOf(await prisma.marketplaceSettings.update({ where: { id: 1 }, data: patch }));
  },

  async endingSoon(now, reminderDays) {
    const rows = await prisma.shop.findMany({
      where: {
        status: 'active',
        plan: { kind: 'paid' },
        accessEndsAt: { gt: now, lte: addDays(now, reminderDays) },
      },
      include: shopInclude,
    });
    return rows.map(toShop);
  },

  async markReminded(id, endsAt) {
    const { count } = await prisma.shop.updateMany({
      where: { id, accessEndsAt: endsAt, OR: [{ reminderSentFor: null }, { reminderSentFor: { not: endsAt } }] },
      data: { reminderSentFor: endsAt },
    });
    return count === 1;
  },
};
