import { noopErrorReporter, type ErrorReporter } from '../infrastructure/monitoring/errorReporter.js';

/**
 * Outil de supervision du processus, choisi au démarrage (server.ts, worker.ts). Le logger y envoie chaque
 * log de niveau error ou fatal : aucune erreur journalisée n'échappe à la supervision.
 */
let current: ErrorReporter = noopErrorReporter;

export function setErrorReporter(reporter: ErrorReporter) {
  current = reporter;
}

export const errorReporter = (): ErrorReporter => current;
