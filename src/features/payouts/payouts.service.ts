import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { PayoutRecord, PayoutsRepository } from './payouts.repository.js';
import type { ListPayoutsQuery, MarkPayoutPaidInput } from './payouts.schemas.js';

const toDto = (p: PayoutRecord) => ({
  ...p,
  paidAt: p.paidAt?.toISOString() ?? null,
  createdAt: p.createdAt.toISOString(),
});

/**
 * Reversements aux vendeurs (cahier des charges 1.2, 32.6) : ce qu'un livreur OKOZA a encaissé pour une boutique,
 * moins la livraison et la commission, à lui rendre. L'équipe les fait et les trace.
 */
export const createPayoutsService = (payouts: PayoutsRepository, now: () => Date) => ({
  async listForStaff(query: ListPayoutsQuery, actor: Grantee) {
    if (!can(actor, 'paiements:consulter')) throw new ForbiddenError();
    const { items, total, due } = await payouts.list(query);
    return { ...paginate(items.map(toDto), total, query.page, query.limit), due };
  },

  async markPaid(id: string, input: MarkPayoutPaidInput, actor: Grantee & { id: string }) {
    if (!can(actor, 'paiements:valider')) throw new ForbiddenError();
    const payout = await payouts.findById(id);
    if (!payout) throw new NotFoundError('Reversement introuvable.');
    if (input.method !== 'cash' && !input.reference)
      throw new UnprocessableError('Indiquez la référence de la transaction Mobile Money.');
    const paid = await payouts.markPaid(id, { ...input, staffId: actor.id, at: now() });
    if (!paid) throw new ConflictError('Ce reversement est déjà enregistré.');
    return toDto(paid);
  },
});

export type PayoutsService = ReturnType<typeof createPayoutsService>;
