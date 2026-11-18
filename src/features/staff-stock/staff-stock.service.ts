import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { StockMovementRecord, StockRepository } from './staff-stock.repository.js';
import type { JournalQuery, ListMovementsQuery, StockMovementInput } from './staff-stock.schemas.js';

const toDto = (m: StockMovementRecord) => ({ ...m, createdAt: m.createdAt.toISOString() });

/** Réception : droit de créer du stock ; inventaire : droit de le modifier (cahier des charges, 2.4 et 7.3). */
const REQUIRED = { reception: 'stock:creer', ajustement: 'stock:modifier' } as const;

export const createStaffStockService = (stock: StockRepository) => ({
  async move(variantId: string, input: StockMovementInput, actor: Grantee & { id: string }) {
    if (!can(actor, REQUIRED[input.type])) throw new ForbiddenError();
    const change =
      input.type === 'reception'
        ? { type: 'reception' as const, quantity: input.quantity }
        : { type: 'ajustement' as const, counted: input.counted };
    const result = await stock.adjust(variantId, change, input.reason, actor.id);
    if (result.outcome === 'not_found') throw new NotFoundError('Variante introuvable.');
    if (result.outcome === 'below_reserved')
      throw new ConflictError(
        `Impossible : ${result.reserved} article${result.reserved > 1 ? 's sont réservés' : ' est réservé'} par des commandes en cours.`,
      );
    return { movement: toDto(result.movement), available: result.available };
  },

  async history(variantId: string, query: ListMovementsQuery) {
    const { items, total } = await stock.listMovements(variantId, query);
    return paginate(items.map(toDto), total, query.page, query.limit);
  },

  /** Journal général du stock (7.3) : lecture réservée à stock:consulter, vérifiée ici aussi */
  async journal(query: JournalQuery, actor: Grantee) {
    if (!can(actor, 'stock:consulter')) throw new ForbiddenError();
    const { items, total } = await stock.listJournal(query);
    return paginate(items.map(toDto), total, query.page, query.limit);
  },
});

export type StaffStockService = ReturnType<typeof createStaffStockService>;
