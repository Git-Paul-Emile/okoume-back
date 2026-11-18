import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { nextPeriod } from '../shops/shops.rules.js';

export interface BoostPlanRecord {
  id: string;
  name: string;
  description: string;
  durationDays: number;
  price: number;
  active: boolean;
  position: number;
}

export type BoostPlanFields = Omit<BoostPlanRecord, 'id'>;

export interface BoostRecord {
  id: string;
  listing: { id: string; slug: string; title: string };
  shop: { id: string; name: string; ownerId: string };
  plan: { id: string; name: string; durationDays: number };
  amount: number;
  method: 'airtel' | 'moov';
  reference: string;
  status: 'pending' | 'validated' | 'refused';
  decisionReason: string | null;
  decidedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
}

export interface NewBoost {
  listingId: string;
  shopId: string;
  planId: string;
  amount: number;
  method: 'airtel' | 'moov';
  reference: string;
}

export type BoostDecision =
  { validated: true; staffId: string; at: Date } | { validated: false; reason: string; staffId: string; at: Date };

/** Contrat des offres et des mises en avant payantes des annonces (32.10). */
export interface BoostsRepository {
  listPlans(filter: { activeOnly: boolean }): Promise<BoostPlanRecord[]>;
  findPlan(id: string): Promise<BoostPlanRecord | null>;
  createPlan(fields: BoostPlanFields): Promise<BoostPlanRecord | 'name_taken'>;
  /** null : offre introuvable. */
  updatePlan(id: string, fields: Partial<BoostPlanFields>): Promise<BoostPlanRecord | 'name_taken' | null>;
  declare(boost: NewBoost): Promise<BoostRecord | 'pending_exists' | 'reference_used'>;
  findById(id: string): Promise<BoostRecord | null>;
  list(query: {
    status?: BoostRecord['status'] | undefined;
    shopId?: string | undefined;
    page: number;
    limit: number;
  }): Promise<{ items: BoostRecord[]; total: number }>;
  /**
   * Décision sur une mise en avant en attente, dans une transaction. Validée, elle commence à la fin de la mise en
   * avant en cours de l'annonce (aucun jour perdu), sinon à la validation. « stale » : plus en attente.
   */
  decide(id: string, decision: BoostDecision): Promise<BoostRecord | 'stale'>;
  /** Référence de transaction déjà déclarée pour une mise en avant (hors refus). */
  referenceUsed(method: 'airtel' | 'moov', reference: string): Promise<boolean>;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const planColumns = {
  id: true,
  name: true,
  description: true,
  durationDays: true,
  price: true,
  active: true,
  position: true,
} as const satisfies Prisma.BoostPlanSelect;

const toPlan = (row: Prisma.BoostPlanGetPayload<{ select: typeof planColumns }>): BoostPlanRecord => ({
  ...row,
  price: row.price.toNumber(),
});

const include = {
  listing: { select: { id: true, slug: true, title: true } },
  shop: { select: { id: true, name: true, ownerId: true } },
  plan: { select: { id: true, name: true, durationDays: true } },
} as const satisfies Prisma.ListingBoostInclude;
type Row = Prisma.ListingBoostGetPayload<{ include: typeof include }>;

/** Le moyen « espèces » est exclu par la base (listing_boosts_mobile_money) : seuls airtel et moov reviennent. */
function toBoost({ listingId: _l, shopId: _s, planId: _p, decidedById: _d, amount, method, ...row }: Row): BoostRecord {
  if (method === 'cash') throw new Error(`Mise en avant ${row.id} en espèces : contrainte de base absente`);
  return { ...row, method, amount: amount.toNumber() };
}

export const boostsRepository: BoostsRepository = {
  async listPlans({ activeOnly }) {
    const rows = await prisma.boostPlan.findMany({
      where: activeOnly ? { active: true } : {},
      select: planColumns,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toPlan);
  },

  async findPlan(id) {
    const row = await prisma.boostPlan.findUnique({ where: { id }, select: planColumns });
    return row ? toPlan(row) : null;
  },

  async createPlan(fields) {
    try {
      return toPlan(await prisma.boostPlan.create({ data: fields, select: planColumns }));
    } catch (error) {
      if (isUniqueViolation(error)) return 'name_taken';
      throw error;
    }
  },

  async updatePlan(id, fields) {
    try {
      const { count } = await prisma.boostPlan.updateMany({ where: { id }, data: fields });
      if (!count) return null;
      return toPlan(await prisma.boostPlan.findUniqueOrThrow({ where: { id }, select: planColumns }));
    } catch (error) {
      if (isUniqueViolation(error)) return 'name_taken';
      throw error;
    }
  },

  async declare(boost) {
    const pending = await prisma.listingBoost.findFirst({
      where: { listingId: boost.listingId, status: 'pending' },
      select: { id: true },
    });
    if (pending) return 'pending_exists';
    if (await boostsRepository.referenceUsed(boost.method, boost.reference)) return 'reference_used';
    try {
      return toBoost(await prisma.listingBoost.create({ data: boost, include }));
    } catch (error) {
      // Course avec une autre déclaration : l'un des deux index uniques partiels a tranché
      if (isUniqueViolation(error)) return 'pending_exists';
      throw error;
    }
  },

  async findById(id) {
    const row = await prisma.listingBoost.findUnique({ where: { id }, include });
    return row ? toBoost(row) : null;
  },

  async list({ status, shopId, page, limit }) {
    const where: Prisma.ListingBoostWhereInput = { ...(status ? { status } : {}), ...(shopId ? { shopId } : {}) };
    const [rows, total] = await prisma.$transaction([
      prisma.listingBoost.findMany({
        where,
        include,
        orderBy: { createdAt: status === 'pending' ? 'asc' : 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.listingBoost.count({ where }),
    ]);
    return { items: rows.map(toBoost), total };
  },

  async decide(id, decision) {
    return prisma.$transaction(async (tx) => {
      const boost = await tx.listingBoost.findUnique({
        where: { id },
        select: { status: true, listingId: true, plan: { select: { durationDays: true } } },
      });
      if (boost?.status !== 'pending') return 'stale';
      let data: Prisma.ListingBoostUncheckedUpdateManyInput;
      if (decision.validated) {
        const current = await tx.listingBoost.findFirst({
          where: { listingId: boost.listingId, status: 'validated', endsAt: { gt: decision.at } },
          orderBy: { endsAt: 'desc' },
          select: { endsAt: true },
        });
        const period = nextPeriod(current?.endsAt ?? null, decision.at, boost.plan.durationDays);
        data = {
          status: 'validated',
          decidedById: decision.staffId,
          decidedAt: decision.at,
          startsAt: period.start,
          endsAt: period.end,
        };
      } else {
        data = {
          status: 'refused',
          decisionReason: decision.reason,
          decidedById: decision.staffId,
          decidedAt: decision.at,
        };
      }
      const { count } = await tx.listingBoost.updateMany({ where: { id, status: 'pending' }, data });
      if (!count) return 'stale';
      return toBoost(await tx.listingBoost.findUniqueOrThrow({ where: { id }, include }));
    });
  },

  async referenceUsed(method, reference) {
    const used = await prisma.listingBoost.findFirst({
      where: { method, reference, status: { not: 'refused' } },
      select: { id: true },
    });
    return used !== null;
  },
};
