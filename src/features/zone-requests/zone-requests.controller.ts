import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { ZoneRequestsService } from './zone-requests.service.js';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. */
export const createZoneRequestsController = (service: ZoneRequestsService) => ({
  async create(req: Request, res: Response) {
    return sendSuccess(res, await service.create(req.body), 201, 'Demande transmise.');
  },

  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list(req.staff!));
  },

  async decide(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.decide(String(req.params.id), req.body, req.staff!),
      200,
      'Demande mise à jour.',
    );
  },
});
