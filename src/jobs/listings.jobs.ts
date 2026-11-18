import type { ListingReviewWorker } from '../features/listings/listings.review.js';
import type { QueuedJob } from '../infrastructure/queue/jobs.js';
import { logger } from '../lib/logger.js';

/** Vérification assistée d'une annonce (32.3). Une panne du fournisseur est levée : la file reprend le job. */
export const createListingReviewHandler =
  (worker: ListingReviewWorker) => async (jobs: Array<QueuedJob<'listings.review'>>) => {
    for (const job of jobs) await worker.review(job.data.listingId, job.data.version);
  };

/** Toutes les reprises ont échoué : l'annonce passe en modération humaine au lieu d'attendre indéfiniment. */
export const createDeadListingReviewHandler =
  (worker: ListingReviewWorker) => async (jobs: Array<QueuedJob<'listings.review'>>) => {
    for (const job of jobs) {
      logger.error({ jobId: job.id, listingId: job.data.listingId }, 'Vérification d’annonce abandonnée');
      await worker.fallbackToModeration(job.data.listingId, job.data.version);
    }
  };
