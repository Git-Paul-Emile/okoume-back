import { ForbiddenError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import type { PayoutRecord, PayoutsRepository } from './payouts.repository.js';
import type { ListPayoutsQuery, SellerPayoutsQuery } from './payouts.schemas.js';

const toDto = (payout: PayoutRecord) => ({
  ...payout,
  paidAt: payout.paidAt?.toISOString() ?? null,
  createdAt: payout.createdAt.toISOString(),
});

/** Consultation des reversements par l'equipe et par le vendeur proprietaire. */
export const createPayoutsService = (payouts: PayoutsRepository, shops: ShopsRepository) => ({
  async listForStaff(query: ListPayoutsQuery, actor: Grantee) {
    if (!can(actor, 'paiements:consulter')) throw new ForbiddenError();
    const { items, total, due } = await payouts.list(query);
    return { ...paginate(items.map(toDto), total, query.page, query.limit), due };
  },

  async listForSeller(query: SellerPayoutsQuery, customerId: string) {
    const shop = await shops.findByOwner(customerId);
    if (!shop) throw new ForbiddenError('Ouvrez d’abord votre boutique pour consulter vos reversements.');
    const { items, total, due } = await payouts.list({ ...query, shopId: shop.id });
    return { ...paginate(items.map(toDto), total, query.page, query.limit), due };
  },
});

export type PayoutsService = ReturnType<typeof createPayoutsService>;
