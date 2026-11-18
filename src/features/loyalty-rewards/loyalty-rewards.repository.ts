import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { personalCode, referralSignals, REFERRAL_BURST_WINDOW_MS } from './loyalty-rewards.rules.js';

type Tx = Prisma.TransactionClient;

export interface ReferralRewardRecord {
  id: string;
  referrerId: string;
  refereeId: string;
  refereeName: string;
  orderId: string;
  orderNumber: string;
  points: number;
  status: 'pending' | 'granted' | 'rejected';
  signals: string[];
  decisionNote: string | null;
  createdAt: Date;
}

export interface BirthdayCandidate {
  id: string;
  firstName: string;
  birthdayChoice: 'points' | 'code';
}

/** Contrat des récompenses : vérification des parrainages, anniversaires, préférences du client. */
export interface LoyaltyRewardsRepository {
  listReferrals(filters: {
    status?: ReferralRewardRecord['status'] | undefined;
    page: number;
    limit: number;
  }): Promise<{
    items: ReferralRewardRecord[];
    total: number;
  }>;
  /** false : la récompense n'est plus en attente. */
  decideReferral(id: string, decision: { grant: boolean; note: string; staffId: string; at: Date }): Promise<boolean>;
  /** Clients actifs fêtés ces jours-là, pas encore récompensés cette année. */
  birthdayCandidates(days: ReadonlyArray<{ month: number; day: number }>, year: number): Promise<BirthdayCandidate[]>;
  /** false : déjà récompensé cette année (contrainte d'unicité). */
  grantBirthday(
    customer: BirthdayCandidate,
    year: number,
    reward: { points: number; percent: number; validDays: number },
    at: Date,
  ): Promise<boolean>;
  referralInfo(customerId: string): Promise<{ referralCode: string; referees: number; rewarded: number } | null>;
  updatePreferences(
    customerId: string,
    preferences: { birthDate?: Date | null | undefined; birthdayChoice?: 'points' | 'code' | undefined },
  ): Promise<void>;
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * Première commande livrée et payée d'un client (12.5), dans la transaction qui la met dans cet état :
 * code de bienvenue et récompense du parrain. Aucune écriture ne lève d'erreur de doublon (ON CONFLICT,
 * skipDuplicates) : une erreur annulerait toute la transaction, paiement ou changement d'état compris.
 */
export async function rewardFirstOrder(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      number: true,
      status: true,
      paymentStatus: true,
      phone: true,
      zoneId: true,
      landmark: true,
      total: true,
      createdAt: true,
      customer: { select: { id: true, firstName: true, lastName: true, phone: true, referredById: true } },
    },
  });
  const customer = order?.customer;
  if (!order || !customer || order.status !== 'delivered' || order.paymentStatus !== 'paid') return;
  const earlier = await tx.order.count({
    where: {
      customerId: customer.id,
      id: { not: order.id },
      status: 'delivered',
      paymentStatus: { in: ['paid', 'refund_due', 'refunded'] },
    },
  });
  if (earlier) return;
  const settings = await tx.shopSettings.findUniqueOrThrow({ where: { id: 1 } });

  if (settings.welcomeEnabled)
    await tx.$executeRaw`
      INSERT INTO promo_codes (id, kind, code, label, type, value, tiers, starts_at, ends_at, max_uses, per_customer,
                               customer_id, created_at, updated_at)
      VALUES (gen_random_uuid(), 'welcome', ${personalCode('MERCI')},
              ${`Merci ${customer.firstName} : ${settings.welcomePercent} % sur votre prochaine commande`},
              'percent', ${settings.welcomePercent}, '{}', CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP + make_interval(days => ${settings.welcomeValidDays}), 1, 1,
              ${customer.id}::uuid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING`;

  if (!customer.referredById || settings.referralReward <= 0) return;
  const referrer = await tx.customer.findUnique({
    where: { id: customer.referredById },
    select: { id: true, status: true, phone: true, orders: { select: { zoneId: true, landmark: true }, take: 50 } },
  });
  if (!referrer || referrer.status !== 'active') return;
  // Fenêtre comptée à partir de la commande du filleul : résultat identique si l'étape est rejouée
  const recentReferrals = await tx.referralReward.count({
    where: {
      referrerId: referrer.id,
      status: { not: 'rejected' },
      createdAt: { gte: new Date(order.createdAt.getTime() - REFERRAL_BURST_WINDOW_MS) },
    },
  });
  const signals = referralSignals({
    referrer: { phone: referrer.phone, addresses: referrer.orders },
    referee: { phone: customer.phone },
    order: { phone: order.phone, zoneId: order.zoneId, landmark: order.landmark, total: order.total.toNumber() },
    recentReferrals,
  });
  const created = await tx.referralReward.createMany({
    data: [
      {
        referrerId: referrer.id,
        refereeId: customer.id,
        orderId: order.id,
        points: settings.referralReward,
        status: signals.length ? 'pending' : 'granted',
        signals,
      },
    ],
    skipDuplicates: true,
  });
  if (created.count && !signals.length)
    await tx.loyaltyMovement.create({
      data: {
        customerId: referrer.id,
        points: settings.referralReward,
        type: 'referral',
        label: `Parrainage de ${customer.firstName} ${customer.lastName.slice(0, 1)}. (${order.number})`,
        orderId: order.id,
      },
      select: { id: true },
    });
}

const referralInclude = {
  referee: { select: { firstName: true, lastName: true } },
  order: { select: { number: true } },
} as const satisfies Prisma.ReferralRewardInclude;

export const loyaltyRewardsRepository: LoyaltyRewardsRepository = {
  async listReferrals({ status, page, limit }) {
    const where = status ? { status } : {};
    const [rows, total] = await prisma.$transaction([
      prisma.referralReward.findMany({
        where,
        include: referralInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.referralReward.count({ where }),
    ]);
    return {
      items: rows.map(({ referee, order, decidedById: _d, decidedAt: _a, ...r }) => ({
        ...r,
        refereeName: `${referee.firstName} ${referee.lastName.slice(0, 1)}.`,
        orderNumber: order.number,
      })),
      total,
    };
  },

  /** Accordée : les points sont crédités au parrain dans la même transaction que la décision. */
  async decideReferral(id, { grant, note, staffId, at }) {
    return prisma.$transaction(async (tx) => {
      const decided = await tx.referralReward.updateMany({
        where: { id, status: 'pending' },
        data: { status: grant ? 'granted' : 'rejected', decisionNote: note, decidedById: staffId, decidedAt: at },
      });
      if (decided.count !== 1) return false;
      if (grant) {
        const reward = await tx.referralReward.findUniqueOrThrow({ where: { id }, include: referralInclude });
        await tx.loyaltyMovement.create({
          data: {
            customerId: reward.referrerId,
            points: reward.points,
            type: 'referral',
            label: `Parrainage de ${reward.referee.firstName} ${reward.referee.lastName.slice(0, 1)}. (${reward.order.number})`,
            orderId: reward.orderId,
            staffId,
          },
          select: { id: true },
        });
      }
      return true;
    });
  },

  async birthdayCandidates(days, year) {
    if (!days.length) return [];
    const sameDay = days.map(
      (d) => Prisma.sql`(EXTRACT(MONTH FROM c.birth_date) = ${d.month} AND EXTRACT(DAY FROM c.birth_date) = ${d.day})`,
    );
    const rows = await prisma.$queryRaw<Array<{ id: string; first_name: string; birthday_choice: 'points' | 'code' }>>`
      SELECT c.id, c.first_name, c.birthday_choice FROM customers c
      WHERE c.status = 'active' AND c.birth_date IS NOT NULL AND (${Prisma.join(sameDay, ' OR ')})
        AND NOT EXISTS (SELECT 1 FROM birthday_rewards b WHERE b.customer_id = c.id AND b.year = ${year})`;
    return rows.map((r) => ({ id: r.id, firstName: r.first_name, birthdayChoice: r.birthday_choice }));
  },

  /** Récompense d'abord (une par an, sans doublon possible), puis points ou code selon le choix du client. */
  async grantBirthday(customer, year, reward, at) {
    return prisma.$transaction(async (tx) => {
      const created = await tx.birthdayReward.createMany({
        data: [{ customerId: customer.id, year, choice: customer.birthdayChoice }],
        skipDuplicates: true,
      });
      if (!created.count) return false;
      if (customer.birthdayChoice === 'points') {
        if (reward.points > 0)
          await tx.loyaltyMovement.create({
            data: {
              customerId: customer.id,
              points: reward.points,
              type: 'birthday',
              label: `Joyeux anniversaire ${year}`,
            },
            select: { id: true },
          });
        return true;
      }
      const code = await tx.promoCode.create({
        data: {
          kind: 'birthday',
          code: personalCode('ANNIV'),
          label: `Joyeux anniversaire ${customer.firstName} : ${reward.percent} % sur votre commande`,
          type: 'percent',
          value: reward.percent,
          startsAt: at,
          endsAt: new Date(at.getTime() + reward.validDays * DAY_MS),
          maxUses: 1,
          perCustomer: 1,
          customerId: customer.id,
        },
        select: { id: true },
      });
      await tx.birthdayReward.update({
        where: { customerId_year: { customerId: customer.id, year } },
        data: { promoCodeId: code.id },
        select: { id: true },
      });
      return true;
    });
  },

  async referralInfo(customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        referralCode: true,
        _count: { select: { referees: true, referralsGiven: { where: { status: 'granted' } } } },
      },
    });
    return customer
      ? {
          referralCode: customer.referralCode,
          referees: customer._count.referees,
          rewarded: customer._count.referralsGiven,
        }
      : null;
  },

  async updatePreferences(customerId, preferences) {
    await prisma.customer.update({ where: { id: customerId }, data: preferences, select: { id: true } });
  },
};
