import type { ProductReviewWorker } from '../features/seller-products/seller-products.review.js';
import type { QueuedJob } from '../infrastructure/queue/jobs.js';
import { logger } from '../lib/logger.js';

/** Vérification assistée d'un produit de vendeur (32.3). Une panne du fournisseur est levée : la file reprend le job. */
export const createProductReviewHandler =
  (worker: ProductReviewWorker) => async (jobs: Array<QueuedJob<'products.review'>>) => {
    for (const job of jobs) await worker.review(job.data.productId, job.data.version);
  };

/** Toutes les reprises ont échoué : le produit passe en modération humaine au lieu d'attendre indéfiniment. */
export const createDeadProductReviewHandler =
  (worker: ProductReviewWorker) => async (jobs: Array<QueuedJob<'products.review'>>) => {
    for (const job of jobs) {
      logger.error({ jobId: job.id, productId: job.data.productId }, 'Vérification de produit abandonnée');
      await worker.fallbackToModeration(job.data.productId, job.data.version);
    }
  };
