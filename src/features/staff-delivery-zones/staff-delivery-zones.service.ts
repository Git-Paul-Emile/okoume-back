import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/AppError.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { StaffZonesRepository } from './staff-delivery-zones.repository.js';
import type { CreateZoneInput, UpdateZoneInput } from './staff-delivery-zones.schemas.js';

const NAME_TAKEN = 'Une zone porte déjà ce nom dans cette ville.';

/**
 * Zones de livraison (cahier des charges, 9.1), gérées depuis la page Livraisons : droit commandes:modifier.
 * Un changement de frais vaut pour les commandes suivantes ; une commande garde les frais de son passage.
 */
export const createStaffZonesService = (zones: StaffZonesRepository) => {
  function require(actor: Grantee) {
    if (!can(actor, 'commandes:modifier')) throw new ForbiddenError();
  }

  return {
    list: () => zones.findAll(),

    async create(input: CreateZoneInput, actor: Grantee) {
      require(actor);
      const created = await zones.create(input);
      if (!created) throw new ConflictError(NAME_TAKEN);
      return created;
    },

    async update(id: string, input: UpdateZoneInput, actor: Grantee) {
      require(actor);
      const updated = await zones.update(id, input);
      if (updated === undefined) throw new NotFoundError('Zone introuvable.');
      if (updated === null) throw new ConflictError(NAME_TAKEN);
      return updated;
    },
  };
};

export type StaffZonesService = ReturnType<typeof createStaffZonesService>;
