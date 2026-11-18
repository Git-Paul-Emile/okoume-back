import type { JobQueue } from './jobQueue.js';
import type { JobName, JobPayloads } from './jobs.js';

/** Implémentation de test : garde les jobs en mémoire pour les vérifier ou les exécuter. */
export function createMemoryJobQueue(): JobQueue & { jobs: Array<{ name: JobName; data: JobPayloads[JobName] }> } {
  const jobs: Array<{ name: JobName; data: JobPayloads[JobName] }> = [];
  return {
    jobs,
    async send(name, data) {
      jobs.push({ name, data });
    },
  };
}
