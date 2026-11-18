import type { ChatReplyWorker } from '../features/chat/chat.reply.js';
import type { QueuedJob } from '../infrastructure/queue/jobs.js';
import { logger } from '../lib/logger.js';

/** Réponse de l'assistant du tchat (32.5). Une panne du fournisseur est levée : la file reprend le job. */
export const createChatReplyHandler = (worker: ChatReplyWorker) => async (jobs: Array<QueuedJob<'chat.reply'>>) => {
  for (const job of jobs) await worker.reply(job.data.conversationId, job.data.messageId);
};

/** Toutes les reprises ont échoué : le vendeur prend le relais au lieu de laisser l'acheteur sans réponse. */
export const createDeadChatReplyHandler = (worker: ChatReplyWorker) => async (jobs: Array<QueuedJob<'chat.reply'>>) => {
  for (const job of jobs) {
    logger.error({ jobId: job.id, conversationId: job.data.conversationId }, 'Réponse du tchat abandonnée');
    await worker.fallbackToSeller(job.data.conversationId, job.data.messageId);
  }
};
