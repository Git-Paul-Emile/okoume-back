import type { JobName, JobPayloads } from './jobs.js';

/** File de traitements différés, dans le vocabulaire du métier : le fournisseur n'apparaît pas. */
export interface JobQueue {
  send<N extends JobName>(name: N, data: JobPayloads[N]): Promise<void>;
}
