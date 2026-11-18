import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHealthService, DEPENDENCY_TIMEOUT_MS } from './health.service.js';

describe('disponibilité', () => {
  afterEach(() => vi.useRealTimers());

  it('considère la base en panne si elle ne répond pas dans le délai', async () => {
    vi.useFakeTimers();
    const service = createHealthService({ pingDatabase: () => new Promise<void>(() => undefined) });
    const pending = service.readiness();
    await vi.advanceTimersByTimeAsync(DEPENDENCY_TIMEOUT_MS + 1);
    await expect(pending).resolves.toMatchObject({ ready: false, checks: { database: { status: 'down' } } });
  });

  it('est prête quand la base répond', async () => {
    const service = createHealthService({ pingDatabase: () => Promise.resolve() });
    await expect(service.readiness()).resolves.toMatchObject({ ready: true });
  });
});
