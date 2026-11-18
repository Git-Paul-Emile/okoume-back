import { afterEach, describe, expect, it } from 'vitest';
import { noopErrorReporter, type ErrorContext } from '../infrastructure/monitoring/errorReporter.js';
import { setErrorReporter } from './errorReporting.js';
import { logger } from './logger.js';

function capturing() {
  const captured: { error: unknown; context: ErrorContext }[] = [];
  setErrorReporter({ capture: (error, context) => captured.push({ error, context }), flush: async () => undefined });
  return captured;
}

// Les tests tournent avec LOG_LEVEL=silent : un logger enfant rouvre les niveaux utiles
const log = () => logger.child({}, { level: 'info' });

describe('logger et supervision', () => {
  afterEach(() => setErrorReporter(noopErrorReporter));

  it('remonte une erreur journalisée, avec son message et son identifiant de requête', () => {
    const captured = capturing();
    const err = new Error('base injoignable');
    log()
      .child({ req: { id: 'req-1234abcd' } })
      .error({ err }, 'Erreur imprévue');
    expect(captured).toEqual([
      { error: err, context: { level: 'error', message: 'Erreur imprévue', requestId: 'req-1234abcd' } },
    ]);
  });

  it('distingue une erreur fatale', () => {
    const captured = capturing();
    log().fatal({ err: new Error('arrêt') }, 'Démarrage impossible');
    expect(captured[0]?.context.level).toBe('fatal');
  });

  it('ignore les logs sans erreur et ceux de niveau inférieur', () => {
    const captured = capturing();
    log().error('Arrêt forcé après délai');
    log().error({ res: { statusCode: 500 } }, 'request completed');
    log().warn({ err: new Error('récupérable') }, 'Nouvel essai');
    expect(captured).toEqual([]);
  });
});

describe('relevé automatique des réponses en erreur', () => {
  afterEach(() => setErrorReporter(noopErrorReporter));

  it('n’envoie pas à la supervision le relevé d’une réponse 5xx fait par pino-http', () => {
    const captured = capturing();
    log().error({ err: new Error('failed with status code 503') }, 'request errored');
    expect(captured).toEqual([]);
  });
});
