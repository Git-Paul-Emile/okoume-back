import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { movementsQuery } from './loyalty.schemas.js';
import type { LoyaltyService } from './loyalty.service.js';

export const createLoyaltyController = (service: LoyaltyService) => ({
  async summary(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.summary(req.customer!.id));
  },

  async movements(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.movements(req.customer!.id, movementsQuery.parse(req.query)));
  },
});
