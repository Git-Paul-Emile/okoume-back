/**
 * Remontée des erreurs vers l'outil de supervision (rules/20-qualite/observability.md), dans le vocabulaire
 * de l'application : le reste du code ne connaît pas le fournisseur (rules/10-stack/external-services.md).
 */
export interface ErrorContext {
  /** Message du log qui accompagne l'erreur */
  message?: string;
  /** Identifiant de requête, pour retrouver toute la chaîne dans les logs */
  requestId?: string;
  level: 'error' | 'fatal';
}

export interface ErrorReporter {
  capture(error: unknown, context: ErrorContext): void;
  /** Attend l'envoi des erreurs en cours, avant un arrêt du processus */
  flush(timeoutMs: number): Promise<void>;
}

/** Sans outil configuré (développement, tests) : rien n'est envoyé, les logs restent la seule trace. */
export const noopErrorReporter: ErrorReporter = {
  capture: () => undefined,
  flush: async () => undefined,
};
