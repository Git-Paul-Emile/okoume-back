import { ConflictError, ForbiddenError } from '../../core/errors/AppError.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { Notifier } from '../notifications/notifier.js';
import type { ZoneRequestRecord, ZoneRequestsRepository } from './zone-requests.repository.js';
import type { DecideZoneRequestInput, ZoneRequestInput } from './zone-requests.schemas.js';

export const toZoneRequestDto = (r: ZoneRequestRecord) => ({ ...r, createdAt: r.createdAt.toISOString() });

export interface ZoneRequestsDependencies {
  requests: ZoneRequestsRepository;
  notifier: Notifier;
  appUrl: string;
}

/**
 * Demandes de nouveau quartier (9.1) : envoyées sans compte depuis le choix de la livraison, traitées par l'équipe
 * des livraisons (commandes:consulter pour lire, commandes:modifier pour répondre).
 */
export const createZoneRequestsService = (deps: ZoneRequestsDependencies) => {
  const { requests, notifier, appUrl } = deps;
  return {
    async create(input: ZoneRequestInput) {
      const created = await requests.create(input);
      await notifier.notifyStaff('commandes:consulter', {
        title: 'Nouveau quartier demandé',
        body: `${created.neighbourhood} (${created.city})`,
        url: `${appUrl}/admin/livraisons`,
        tag: 'zone-requests',
      });
      // Le visiteur n'a besoin que de la confirmation : rien de ce qu'il a saisi ne lui est renvoyé
      return { id: created.id };
    },

    async list(actor: Grantee) {
      if (!can(actor, 'commandes:consulter')) throw new ForbiddenError();
      return (await requests.list()).map(toZoneRequestDto);
    },

    async decide(id: string, input: DecideZoneRequestInput, actor: Grantee) {
      if (!can(actor, 'commandes:modifier')) throw new ForbiddenError();
      const decided = await requests.decide(id, input);
      if (!decided) throw new ConflictError('Cette demande a déjà reçu une suite.');
      return toZoneRequestDto(decided);
    },
  };
};

export type ZoneRequestsService = ReturnType<typeof createZoneRequestsService>;
