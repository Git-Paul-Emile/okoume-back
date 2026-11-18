import { ForbiddenError } from '../../core/errors/AppError.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { InformationRepository } from '../settings/settings.repository.js';
import type { AnalyticsRepository } from './analytics.repository.js';
import type { EventInput, WindowQuery } from './analytics.schemas.js';

/** Durée de conservation de l'historique de navigation (19.5) */
export const RETENTION_MONTHS = 13;
/** Événements renvoyés au plus par lecture : au-delà, l'écran montre déjà les tendances */
const READ_LIMIT = 50_000;

/** Mois de la boutique (Libreville, UTC+1) au format AAAA-MM. */
export const periodOf = (at: Date) => new Date(at.getTime() + 3_600_000).toISOString().slice(0, 7);

export interface AnalyticsDependencies {
  analytics: AnalyticsRepository;
  information: Pick<InformationRepository, 'get'>;
  now: () => Date;
}

/**
 * Mesure d'audience (18) et compteur de l'assistant client (16.6). Les événements sont anonymes ; la lecture est
 * réservée au pilotage (pilotage:consulter). Le plafond de l'assistant est appliqué par le serveur.
 */
export const createAnalyticsService = (deps: AnalyticsDependencies) => {
  const { analytics, information, now } = deps;

  function require(actor: Grantee) {
    if (!can(actor, 'pilotage:consulter')) throw new ForbiddenError();
  }

  return {
    async record(input: EventInput) {
      await analytics.record(
        {
          kind: input.kind,
          productId: 'productId' in input ? input.productId : null,
          term: input.kind === 'search' ? input.term : null,
          results: input.kind === 'search' ? input.results : null,
          pwa: input.kind === 'visit' ? input.pwa : false,
        },
        now(),
      );
    },

    async productEvents(window: WindowQuery, actor: Grantee) {
      require(actor);
      return (await analytics.productEvents(window, READ_LIMIT)).map((e) => ({
        id: e.id,
        productId: e.productId,
        kind: e.kind === 'product_view' ? ('view' as const) : ('click' as const),
        at: e.createdAt.toISOString(),
      }));
    },

    async searches(window: WindowQuery, actor: Grantee) {
      require(actor);
      return (await analytics.searches(window, READ_LIMIT)).map((e) => ({
        id: e.id,
        term: e.term,
        results: e.results,
        at: e.createdAt.toISOString(),
      }));
    },

    async daily(window: WindowQuery, actor: Grantee) {
      require(actor);
      return analytics.daily(window);
    },

    /** Traitement planifié : l'historique de navigation de plus de 13 mois est supprimé (19.5). */
    async purgeExpired() {
      const before = new Date(now());
      before.setUTCMonth(before.getUTCMonth() - RETENTION_MONTHS);
      return { deleted: await analytics.purgeBefore(before) };
    },

    /** Compteur du mois et plafond (0 : sans plafond). */
    async assistantUsage() {
      const [count, info] = await Promise.all([analytics.usage(periodOf(now())), information.get()]);
      return { period: periodOf(now()), count, limit: info.assistantMonthlyBudget };
    },

    /** Une requête de l'assistant : refusée côté serveur quand le plafond du mois est atteint. */
    async consumeAssistant() {
      const info = await information.get();
      const period = periodOf(now());
      const limit = info.assistantMonthlyBudget;
      if (limit > 0 && (await analytics.usage(period)) >= limit) return { allowed: false, period, count: limit, limit };
      const count = await analytics.incrementUsage(period);
      return { allowed: true, period, count, limit };
    },
  };
};

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
