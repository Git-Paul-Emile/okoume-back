import type { HealthRepository } from './health.repository.js';
import type { ReadinessDto } from './health.dto.js';

/** Délai maximal accordé à une dépendance pour répondre, au-delà elle est considérée en panne. */
export const DEPENDENCY_TIMEOUT_MS = 2_000;

const withTimeout = <T>(promise: Promise<T>, ms: number) => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Délai dépassé (${ms} ms)`)), ms);
  });
  // Le minuteur est toujours libéré pour ne pas retenir le processus
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

export const createHealthService = (repository: Pick<HealthRepository, 'pingDatabase'>) => ({
  /** Disponibilité : chaque dépendance critique est testée, l'application n'est prête que si toutes répondent. */
  async readiness(): Promise<ReadinessDto> {
    const started = Date.now();
    const database = await withTimeout(repository.pingDatabase(), DEPENDENCY_TIMEOUT_MS).then(
      () => ({ status: 'up' as const, latencyMs: Date.now() - started }),
      () => ({ status: 'down' as const, latencyMs: Date.now() - started }),
    );
    return { ready: database.status === 'up', checks: { database } };
  },
});

export type HealthService = ReturnType<typeof createHealthService>;
