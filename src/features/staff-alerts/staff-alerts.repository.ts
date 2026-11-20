import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import type { AlertChanges, AlertRecord, NewAlert } from './staff-alerts.rules.js';

/** Volumes à traiter, comptés en base au moment de la détection. */
export interface AlertCounts {
  paymentsToVerify: number;
  outOfStock: number;
  lowStock: number;
  lateSupport: number;
  cancellationsPending: number;
  returnsPending: number;
  cashWaiting: number;
  privacyOverdue: number;
  /** Produits de vendeurs transmis à l'équipe par la vérification (32.3) */
  listingsToModerate: number;
  emailsFailed: number;
}

export interface CountRules {
  now: Date;
  /** Délais de première réponse de l'assistance, en heures */
  supportSla: { high: number; normal: number };
  cashPreparationHours: number;
}

/** Contrat de stockage des alertes et des comptages de la détection. */
export interface StaffAlertsRepository {
  list(): Promise<AlertRecord[]>;
  find(id: string): Promise<AlertRecord | null>;
  create(alert: NewAlert): Promise<void>;
  update(id: string, changes: AlertChanges): Promise<AlertRecord | null>;
  counts(rules: CountRules): Promise<AlertCounts>;
  staffExists(id: string): Promise<boolean>;
  staffName(id: string): Promise<string | null>;
}

const episodes = z.array(z.object({ openedAt: z.string(), resolvedAt: z.string().optional() }));
const history = z.array(z.object({ at: z.string(), by: z.string(), event: z.string() }));

// JSON écrit uniquement par ce dépôt : une forme inattendue est une erreur à signaler, pas à masquer
const toRecord = (a: Prisma.StaffAlertGetPayload<object>): AlertRecord => ({
  id: a.id,
  key: a.key,
  level: a.level,
  title: a.title,
  detail: a.detail,
  to: a.to,
  state: a.state,
  occurrences: a.occurrences,
  firstSeenAt: a.firstSeenAt,
  lastSeenAt: a.lastSeenAt,
  cleared: a.cleared,
  assigneeId: a.assigneeId,
  closureReason: a.closureReason,
  actionTaken: a.actionTaken,
  episodes: episodes.parse(a.episodes),
  lastReminderAt: a.lastReminderAt,
  history: history.parse(a.history),
});

const HOUR = 3_600_000;

export const staffAlertsRepository: StaffAlertsRepository = {
  list: async () =>
    (await prisma.staffAlert.findMany({ orderBy: [{ lastSeenAt: 'desc' }, { id: 'asc' }], take: 500 })).map(toRecord),

  find: async (id) => {
    const a = await prisma.staffAlert.findUnique({ where: { id } });
    return a ? toRecord(a) : null;
  },

  async create(alert) {
    await prisma.staffAlert.create({ data: alert });
  },

  async update(id, changes) {
    const result = await prisma.staffAlert.updateMany({ where: { id }, data: changes });
    return result.count ? staffAlertsRepository.find(id) : null;
  },

  async counts({ now, supportSla, cashPreparationHours }) {
    const [variants, ...rest] = await Promise.all([
      // Disponible = stock moins réservations ; seules les variantes des produits publiés comptent
      prisma.$queryRaw<Array<{ out: bigint; low: bigint }>>`
        SELECT COUNT(*) FILTER (WHERE v.stock - v.reserved <= 0) AS out,
               COUNT(*) FILTER (WHERE v.stock - v.reserved > 0 AND v.stock - v.reserved <= v.low_stock_threshold) AS low
        FROM variants v JOIN products p ON p.id = v.product_id
        WHERE p.status = 'published'`,
      prisma.order.count({ where: { paymentStatus: 'awaiting_verification', status: { not: 'cancelled' } } }),
      prisma.supportTicket.count({
        where: {
          status: 'open',
          OR: [
            { priority: 'high', createdAt: { lt: new Date(now.getTime() - supportSla.high * HOUR) } },
            { priority: 'normal', createdAt: { lt: new Date(now.getTime() - supportSla.normal * HOUR) } },
          ],
        },
      }),
      prisma.cancellationRequest.count({ where: { status: 'pending' } }),
      prisma.returnRequest.count({ where: { status: 'pending' } }),
      prisma.order.count({
        where: {
          status: 'confirmed',
          paymentMethod: 'cash',
          createdAt: { lt: new Date(now.getTime() - cashPreparationHours * HOUR) },
        },
      }),
      prisma.privacyRequest.count({ where: { status: { in: ['received', 'in_progress'] }, dueAt: { lt: now } } }),
      prisma.product.count({ where: { moderation: 'pending_moderation' } }),
      prisma.emailDelivery.count({ where: { status: 'failed' } }),
    ]);
    const [payments, lateSupport, cancellations, returns, cash, privacy, listings, emails] = rest;
    return {
      paymentsToVerify: payments,
      outOfStock: Number(variants[0]?.out ?? 0),
      lowStock: Number(variants[0]?.low ?? 0),
      lateSupport,
      cancellationsPending: cancellations,
      returnsPending: returns,
      cashWaiting: cash,
      privacyOverdue: privacy,
      listingsToModerate: listings,
      emailsFailed: emails,
    };
  },

  staffExists: async (id) => (await prisma.staffMember.count({ where: { id, status: 'active' } })) === 1,

  staffName: async (id) => {
    const m = await prisma.staffMember.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
    return m ? `${m.firstName} ${m.lastName}` : null;
  },
};
