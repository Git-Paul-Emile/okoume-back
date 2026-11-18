import { ForbiddenError, NotFoundError } from '../../core/errors/AppError.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { CouriersRepository } from './staff-couriers.repository.js';
import type { CreateCourierInput, ListCouriersQuery, UpdateCourierInput } from './staff-couriers.schemas.js';

/** Répertoire des livreurs (page Livreurs) : lecture commandes:consulter, écriture commandes:modifier. */
export const createStaffCouriersService = (couriers: CouriersRepository) => {
  function require(actor: Grantee, write: boolean) {
    if (!can(actor, write ? 'commandes:modifier' : 'commandes:consulter')) throw new ForbiddenError();
  }

  return {
    async list(query: ListCouriersQuery, actor: Grantee) {
      require(actor, false);
      return couriers.list(query);
    },

    async create(input: CreateCourierInput, actor: Grantee) {
      require(actor, true);
      return couriers.create(input);
    },

    /** Un livreur n'est jamais supprimé (les commandes le référencent) : on le désactive. */
    async update(id: string, input: UpdateCourierInput, actor: Grantee) {
      require(actor, true);
      const updated = await couriers.update(id, input);
      if (!updated) throw new NotFoundError('Livreur introuvable.');
      return updated;
    },
  };
};

export type StaffCouriersService = ReturnType<typeof createStaffCouriersService>;
