import type { Env } from '../../config/env.js';
import { noopErrorReporter, type ErrorReporter } from './errorReporter.js';
import { createSentryErrorReporter } from './sentryErrorReporter.js';

/** Sentry quand SENTRY_DSN est fourni, sinon aucun envoi. */
export const selectErrorReporter = (
  config: Pick<Env, 'SENTRY_DSN' | 'NODE_ENV' | 'RENDER_GIT_COMMIT'>,
  serverName: 'api' | 'worker',
): ErrorReporter =>
  config.SENTRY_DSN
    ? createSentryErrorReporter({
        dsn: config.SENTRY_DSN,
        environment: config.NODE_ENV,
        release: config.RENDER_GIT_COMMIT,
        serverName,
      })
    : noopErrorReporter;
