import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listDeliveriesQuery } from './email-deliveries.schemas.js';
import type { EmailDeliveriesService } from './email-deliveries.service.js';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. */
export const createEmailDeliveriesController = (service: EmailDeliveriesService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list(listDeliveriesQuery.parse(req.query), req.staff!));
  },

  async retry(req: Request, res: Response) {
    await service.retry(String(req.params.id), req.staff!);
    return sendSuccess(res, null, 202, 'E-mail remis en envoi.');
  },
});
