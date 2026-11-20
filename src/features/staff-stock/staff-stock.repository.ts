import { prisma } from '../../lib/prisma.js';

export interface StockMovementRecord {
  id: string;
  type: 'reception' | 'ajustement' | 'commande' | 'annulation' | 'retour' | 'non_vendable' | 'mise_au_rebut';
  before: number;
  after: number;
  delta: number;
  reason: string;
  orderId: string | null;
  by: string | null;
  createdAt: Date;
}

/** Mouvement du journal général : situé sur son produit et sa variante. */
export interface JournalMovementRecord extends StockMovementRecord {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
}

export interface JournalFilter {
  page: number;
  limit: number;
  type?: StockMovementRecord['type'];
}

/** Changement manuel : une réception ajoute des articles, un inventaire fixe la quantité comptée. */
export type ManualChange = { type: 'reception'; quantity: number } | { type: 'ajustement'; counted: number };

export type AdjustResult =
  | { outcome: 'applied'; movement: StockMovementRecord; available: number }
  | { outcome: 'not_found' }
  | { outcome: 'below_reserved'; reserved: number };

/** Contrat du stock côté équipe. */
export interface StockRepository {
  /** staffId null : stock compté par le vendeur depuis son espace (32.8) */
  adjust(variantId: string, change: ManualChange, reason: string, staffId: string | null): Promise<AdjustResult>;
  listMovements(
    variantId: string,
    page: { page: number; limit: number },
  ): Promise<{ items: StockMovementRecord[]; total: number }>;
  /** Tous les mouvements, du plus récent au plus ancien (journal général) */
  listJournal(filter: JournalFilter): Promise<{ items: JournalMovementRecord[]; total: number }>;
}

const include = { staff: { select: { firstName: true, lastName: true } } } as const;

type MovementRow = {
  id: string;
  type: StockMovementRecord['type'];
  before: number;
  after: number;
  delta: number;
  reason: string;
  orderId: string | null;
  createdAt: Date;
  staff: { firstName: string; lastName: string } | null;
};

const toRecord = ({ staff, ...m }: MovementRow): StockMovementRecord => ({
  ...m,
  by: staff ? `${staff.firstName} ${staff.lastName}` : null,
});

export const stockRepository: StockRepository = {
  /**
   * Variante verrouillée le temps du calcul : une commande ne peut pas réserver pendant qu'on fixe le stock.
   * Le stock ne descend jamais sous les quantités déjà réservées par des commandes en cours.
   */
  async adjust(variantId, change, reason, staffId) {
    return prisma.$transaction(async (tx): Promise<AdjustResult> => {
      const [variant] = await tx.$queryRaw<Array<{ stock: number; reserved: number }>>`
        SELECT stock, reserved FROM variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      if (!variant) return { outcome: 'not_found' };
      const before = Number(variant.stock);
      const reserved = Number(variant.reserved);
      const after = change.type === 'reception' ? before + change.quantity : change.counted;
      if (after < reserved) return { outcome: 'below_reserved', reserved };

      await tx.variant.update({ where: { id: variantId }, data: { stock: after }, select: { id: true } });
      const movement = await tx.stockMovement.create({
        data: { variantId, type: change.type, before, after, delta: after - before, reason, staffId },
        include,
      });
      return { outcome: 'applied', movement: toRecord(movement), available: after - reserved };
    });
  },

  async listMovements(variantId, { page, limit }) {
    const where = { variantId };
    const [rows, total] = await prisma.$transaction([
      prisma.stockMovement.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockMovement.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  },

  async listJournal({ page, limit, type }) {
    const where = type ? { type } : {};
    const [rows, total] = await prisma.$transaction([
      prisma.stockMovement.findMany({
        where,
        include: { ...include, variant: { select: { label: true, product: { select: { id: true, name: true } } } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockMovement.count({ where }),
    ]);
    return {
      items: rows.map(({ variant, variantId, ...row }) => ({
        ...toRecord(row),
        variantId,
        productId: variant.product.id,
        productName: variant.product.name,
        variantLabel: variant.label,
      })),
      total,
    };
  },
};
