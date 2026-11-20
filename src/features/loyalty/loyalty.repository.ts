import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { EARN_PER } from '../orders/orders.pricing.js';

export type MovementType = 'earn' | 'redeem' | 'restore' | 'reversal' | 'adjust' | 'referral' | 'birthday';

export interface LoyaltyMovementRecord {
  id: string;
  points: number;
  type: MovementType;
  label: string;
  orderId: string | null;
  createdAt: Date;
}

export interface ShopSettingsRecord {
  maxDiscountRate: number;
  silverThreshold: number;
  goldThreshold: number;
  /** Taux de TVA de la livraison sur les factures (25.4) */
  deliveryVatRate: number;
  /** Récompenses (12.5) : points du parrain, code de bienvenue, cadeau d'anniversaire */
  referralReward: number;
  welcomeEnabled: boolean;
  welcomePercent: number;
  welcomeValidDays: number;
  birthdayEnabled: boolean;
  birthdayPoints: number;
  birthdayPercent: number;
  birthdayValidDays: number;
  /** Adresses de livraison enregistrables par client (2.2) */
  maxAddresses: number;
}

/** Contrat de la fidélité. L'historique ne se modifie jamais : on ajoute des mouvements (12.3). */
export interface LoyaltyRepository {
  balance(customerId: string): Promise<number>;
  movements(
    customerId: string,
    page: { page: number; limit: number },
  ): Promise<{ items: LoyaltyMovementRecord[]; total: number }>;
  /** Achats livrés et payés, nets des remboursements, pour le niveau (12.4). */
  qualifyingSpend(customerId: string): Promise<number>;
  /** Aucune commande non annulée : client « nouveau » pour les codes réservés à une première commande. */
  isNewCustomer(customerId: string): Promise<boolean>;
  /** Points nets encore portés par une commande (gagnés moins déjà retirés). */
  earnedFor(orderId: string): Promise<number>;
  settings(): Promise<ShopSettingsRecord>;
  updateSettings(patch: Partial<ShopSettingsRecord>): Promise<ShopSettingsRecord>;
  /** null : client introuvable. */
  adjust(customerId: string, points: number, label: string, staffId: string): Promise<LoyaltyMovementRecord | null>;
}

type Tx = Prisma.TransactionClient;

/**
 * Crédit des points d'une commande livrée et payée (12.1), dans la transaction qui la fait passer dans cet état.
 * 1 point par tranche de 1 000 FCFA de produits après réductions, hors livraison. L'index partiel
 * loyalty_movements_earn_once empêche un second crédit : ON CONFLICT ne fait alors rien.
 */
export async function creditEarnedPoints(tx: Tx, orderId: string) {
  await tx.$executeRaw`
    INSERT INTO loyalty_movements (id, customer_id, points, type, label, order_id, created_at)
    SELECT gen_random_uuid(), o.customer_id,
           FLOOR(GREATEST(0, o.subtotal - o.code_discount - o.points_discount) / ${EARN_PER})::int,
           'earn', 'Commande ' || o.number || ' livrée et payée', o.id, CURRENT_TIMESTAMP
    FROM orders o
    WHERE o.id = ${orderId}::uuid AND o.customer_id IS NOT NULL AND o.status = 'delivered' AND o.payment_status = 'paid'
      -- Les points récompensent les achats faits auprès de la boutique Okoumé (32.12)
      AND o.shop_id IS NULL
      AND FLOOR(GREATEST(0, o.subtotal - o.code_discount - o.points_discount) / ${EARN_PER}) > 0
    ON CONFLICT (order_id) WHERE type = 'earn' DO NOTHING`;
}

/** Retrait de points dans une transaction (12.3) : le solde peut devenir négatif. */
export async function reversePoints(
  tx: Tx,
  entry: { customerId: string; orderId: string; points: number; label: string },
) {
  if (entry.points <= 0) return;
  await tx.loyaltyMovement.create({
    data: {
      customerId: entry.customerId,
      orderId: entry.orderId,
      points: -entry.points,
      type: 'reversal',
      label: entry.label,
    },
    select: { id: true },
  });
}

/** Points nets d'une commande, lus dans la transaction en cours. */
export async function earnedForOrder(tx: Tx, orderId: string) {
  const sum = await tx.loyaltyMovement.aggregate({
    where: { orderId, type: { in: ['earn', 'reversal'] } },
    _sum: { points: true },
  });
  return Math.max(0, sum._sum.points ?? 0);
}

const toSettings = ({
  maxDiscountRate,
  silverThreshold,
  goldThreshold,
  deliveryVatRate,
  id: _id,
  updatedAt: _u,
  ...rewards
}: Prisma.ShopSettingsGetPayload<object>): ShopSettingsRecord => ({
  maxDiscountRate: maxDiscountRate.toNumber(),
  silverThreshold: silverThreshold.toNumber(),
  goldThreshold: goldThreshold.toNumber(),
  deliveryVatRate: deliveryVatRate.toNumber(),
  ...rewards,
});

export const loyaltyRepository: LoyaltyRepository = {
  async balance(customerId) {
    const sum = await prisma.loyaltyMovement.aggregate({ where: { customerId }, _sum: { points: true } });
    return sum._sum.points ?? 0;
  },

  async movements(customerId, { page, limit }) {
    const where = { customerId };
    const [rows, total] = await prisma.$transaction([
      prisma.loyaltyMovement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, points: true, type: true, label: true, orderId: true, createdAt: true },
      }),
      prisma.loyaltyMovement.count({ where }),
    ]);
    return { items: rows, total };
  },

  async qualifyingSpend(customerId) {
    const [row] = await prisma.$queryRaw<Array<{ spend: Prisma.Decimal | null }>>`
      SELECT SUM(GREATEST(0, o.total - COALESCE(r.refunded, 0))) AS spend
      FROM orders o
      LEFT JOIN (SELECT order_id, SUM(amount) AS refunded FROM payments WHERE kind = 'refund' GROUP BY order_id) r
        ON r.order_id = o.id
      WHERE o.customer_id = ${customerId}::uuid AND o.status = 'delivered'
        AND o.payment_status IN ('paid', 'refund_due', 'refunded')`;
    return Number(row?.spend ?? 0);
  },

  async isNewCustomer(customerId) {
    return (await prisma.order.count({ where: { customerId, status: { not: 'cancelled' } } })) === 0;
  },

  async earnedFor(orderId) {
    return earnedForOrder(prisma, orderId);
  },

  async settings() {
    const row = await prisma.shopSettings.findUniqueOrThrow({ where: { id: 1 } });
    return toSettings(row);
  },

  async updateSettings(patch) {
    return toSettings(await prisma.shopSettings.update({ where: { id: 1 }, data: patch }));
  },

  async adjust(customerId, points, label, staffId) {
    if (!(await prisma.customer.count({ where: { id: customerId } }))) return null;
    return prisma.loyaltyMovement.create({
      data: { customerId, points, type: 'adjust', label, staffId },
      select: { id: true, points: true, type: true, label: true, orderId: true, createdAt: true },
    });
  },
};
