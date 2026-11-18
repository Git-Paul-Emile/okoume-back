import { ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { isOwner, type Grantee } from '../../core/security/permissions.js';
import type { LoyaltyRepository } from '../loyalty/loyalty.repository.js';
import type { LoyaltySettingsInput } from './staff-loyalty.schemas.js';

type Actor = Grantee & { id: string };

/** Fidélité côté équipe : corrections et réglages réservés à l'administrateur principal (12.3, 12.4). */
export const createStaffLoyaltyService = (loyalty: LoyaltyRepository) => {
  function requireOwner(actor: Grantee) {
    if (!isOwner(actor)) throw new ForbiddenError('Réservé à l’administrateur principal.');
  }

  return {
    /** Correction ajoutée à l'historique, qui ne se modifie jamais : l'auteur et le motif y restent. */
    async adjust(customerId: string, points: number, reason: string, actor: Actor) {
      requireOwner(actor);
      const movement = await loyalty.adjust(customerId, points, `Correction : ${reason}`, actor.id);
      if (!movement) throw new NotFoundError('Client introuvable.');
      return {
        movement: { ...movement, createdAt: movement.createdAt.toISOString() },
        balance: await loyalty.balance(customerId),
      };
    },

    async settings(actor: Grantee) {
      requireOwner(actor);
      return loyalty.settings();
    },

    async updateSettings(input: LoyaltySettingsInput, actor: Grantee) {
      requireOwner(actor);
      const next = { ...(await loyalty.settings()), ...input };
      if (next.goldThreshold <= next.silverThreshold)
        throw new UnprocessableError('Le seuil Or doit dépasser le seuil Argent.');
      return loyalty.updateSettings(input);
    },
  };
};

export type StaffLoyaltyService = ReturnType<typeof createStaffLoyaltyService>;
