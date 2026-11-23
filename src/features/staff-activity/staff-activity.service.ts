import { ForbiddenError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, isOwner, type Grantee } from '../../core/security/permissions.js';
import type { ActivityRecord, StaffActivityRepository } from './staff-activity.repository.js';
import type { ExportInput } from './staff-activity.schemas.js';

/** Route qui écrit elle-même son entrée du journal (avec le motif) : l'enregistrement automatique l'ignore */
export const EXPORTS_PATH = '/staff/exports';

/** Domaine d'une route de l'équipe, d'après son premier segment après /staff. */
const AREAS: Record<string, string> = {
  orders: 'Commandes',
  returns: 'Retours',
  products: 'Produits',
  categories: 'Catégories',
  variants: 'Stock',
  'delivery-zones': 'Quartiers livrés',
  'zone-requests': 'Quartiers demandés',
  couriers: 'Livreurs',
  'promo-codes': 'Promotions',
  invoices: 'Factures',
  customers: 'Clients',
  reviews: 'Avis',
  content: 'Contenus',
  team: 'Équipe',
  settings: 'Paramètres',
  listings: 'Place de marché',
  'listing-reports': 'Place de marché',
  shops: 'Place de marché',
  'shop-payments': 'Place de marché',
  boosts: 'Place de marché',
  'boost-plans': 'Place de marché',
  'access-plans': 'Place de marché',
  media: 'Médias',
  push: 'Notifications',
  auth: 'Sécurité',
};

const VERBS: Record<string, string> = {
  POST: 'Action',
  PUT: 'Enregistrement',
  PATCH: 'Modification',
  DELETE: 'Suppression',
};

/** Libellé lisible d'une écriture : domaine, nature et ressource visée (identifiants compris, sans paramètres). */
export function describe(method: string, path: string) {
  // path commence par /staff : le premier segment est ignoré
  const [, area = '', ...rest] = path.split('/').filter(Boolean);
  const name = AREAS[area] ?? area;
  const target = rest.length ? ` : ${rest.join(' / ')}` : '';
  return { area: name, action: `${VERBS[method] ?? method}${target}` };
}

export const toActivityDto = (a: ActivityRecord) => ({ ...a, createdAt: a.createdAt.toISOString() });

/** Écritures de l'équipe : seules celles qui ont abouti sont gardées, les tentatives refusées n'en sont pas. */
export const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Journal d'activité (17.7, 19.4) : tenu par l'API à chaque écriture réussie d'un membre de l'équipe, lu par
 * aux administrateurs. Le libellé vient de la route : l'interface ne peut ni l'écrire ni l'enjoliver.
 */
export const createStaffActivityService = (deps: { activity: StaffActivityRepository; now: () => Date }) => {
  const { activity, now } = deps;
  return {
    async record(staffId: string, method: string, path: string, status: number) {
      await activity.record({ staffId, method, path, status, ...describe(method, path) }, now());
    },

    /**
     * Export déclaré avant la génération du fichier (18.3) : sans entrée au journal, pas de fichier. Le motif est
     * gardé avec le reste de l'entrée, lisible par l'administrateur principal.
     */
    async recordExport(input: ExportInput, actor: Grantee & { id: string }) {
      if (!can(actor, 'exports:exporter')) throw new ForbiddenError('Exports réservés aux membres autorisés.');
      const lines = input.rows > 1 ? ' lignes' : ' ligne';
      await activity.record(
        {
          staffId: actor.id,
          method: 'POST',
          path: EXPORTS_PATH,
          status: 201,
          area: 'Exports',
          action:
            'Export ' +
            input.title +
            ' (' +
            input.format.toUpperCase() +
            ', ' +
            input.rows +
            lines +
            ') : ' +
            input.reason,
        },
        now(),
      );
    },

    async list(query: { staffId?: string | undefined; page: number; limit: number }, actor: Grantee) {
      if (!isOwner(actor)) throw new ForbiddenError('Réservé à l’administrateur principal.');
      const { items, total } = await activity.list(query);
      return paginate(items.map(toActivityDto), total, query.page, query.limit);
    },
  };
};

export type StaffActivityService = ReturnType<typeof createStaffActivityService>;
