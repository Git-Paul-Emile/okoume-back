import * as Sentry from '@sentry/node';
import type { ErrorReporter } from './errorReporter.js';

export interface SentryConfig {
  dsn: string;
  environment: string;
  /** Version déployée (commit), pour relier une erreur à une mise en ligne */
  release: string | undefined;
  /** api ou worker */
  serverName: string;
}

/**
 * Adaptateur Sentry. Aucune donnée de requête ni personnelle (dataCollection) et pas de traces de
 * performance : seules les erreurs sont envoyées, avec l'identifiant de requête.
 */
export function createSentryErrorReporter(config: SentryConfig): ErrorReporter {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    serverName: config.serverName,
    // Aucune donnée de requête ni personnelle (rules/20-qualite/security.md) : l'erreur et son identifiant suffisent
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
    },
    tracesSampleRate: 0,
  });
  return {
    capture(error, context) {
      Sentry.withScope((scope) => {
        scope.setLevel(context.level);
        if (context.requestId) scope.setTag('request_id', context.requestId);
        if (context.message) scope.setExtra('log_message', context.message);
        if (error instanceof Error) Sentry.captureException(error);
        else Sentry.captureMessage(context.message ?? String(error));
      });
    },
    async flush(timeoutMs) {
      await Sentry.flush(timeoutMs);
    },
  };
}
