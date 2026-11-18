import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

export type DeliveryStatus = 'sending' | 'sent' | 'failed' | 'retried';

export interface DeliveryRecord {
  id: string;
  to: string;
  subject: string;
  text: string | null;
  sensitive: boolean;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface AttemptStart {
  id: string;
  to: string;
  subject: string;
  /** null pour un e-mail sensible : jamais conservé */
  text: string | null;
  sensitive: boolean;
}

/** Contrat de stockage du suivi des envois. */
export interface EmailDeliveriesRepository {
  /** Un essai commence : la ligne est créée au premier, son compteur augmente aux suivants. */
  startAttempt(attempt: AttemptStart): Promise<void>;
  /** Parti : le texte n'est plus conservé. */
  markSent(id: string, at: Date): Promise<void>;
  markError(id: string, error: string): Promise<void>;
  markFailed(id: string): Promise<void>;
  /** Relance : seulement un e-mail en échec non encore relancé ; null sinon. */
  claimForRetry(id: string): Promise<DeliveryRecord | null>;
  list(filters: { status?: DeliveryStatus | undefined; page: number; limit: number }): Promise<{
    items: DeliveryRecord[];
    total: number;
  }>;
  countFailed(): Promise<number>;
}

export const emailDeliveriesRepository: EmailDeliveriesRepository = {
  async startAttempt({ id, ...attempt }) {
    await prisma.emailDelivery.upsert({
      where: { id },
      create: { id, ...attempt, attempts: 1 },
      update: { attempts: { increment: 1 }, status: 'sending' },
    });
  },

  async markSent(id, at) {
    await prisma.emailDelivery.update({
      where: { id },
      data: { status: 'sent', sentAt: at, text: null, lastError: null },
    });
  },

  async markError(id, error) {
    await prisma.emailDelivery.update({ where: { id }, data: { lastError: error.slice(0, 500) } });
  },

  async markFailed(id) {
    await prisma.emailDelivery.updateMany({ where: { id, status: { not: 'sent' } }, data: { status: 'failed' } });
  },

  async claimForRetry(id) {
    const where: Prisma.EmailDeliveryWhereInput = { id, status: 'failed', sensitive: false, text: { not: null } };
    const current = await prisma.emailDelivery.findFirst({ where });
    if (!current) return null;
    // Une seule relance par e-mail en échec, même si deux membres cliquent ensemble
    const claimed = await prisma.emailDelivery.updateMany({ where, data: { status: 'retried', text: null } });
    return claimed.count ? current : null;
  },

  async list({ status, page, limit }) {
    const where = status ? { status } : {};
    const [items, total] = await prisma.$transaction([
      prisma.emailDelivery.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.emailDelivery.count({ where }),
    ]);
    return { items, total };
  },

  countFailed: () => prisma.emailDelivery.count({ where: { status: 'failed' } }),
};
