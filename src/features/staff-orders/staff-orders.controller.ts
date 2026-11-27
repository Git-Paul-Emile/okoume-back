import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listStaffOrdersQuery } from './staff-orders.schemas.js';
import type { StaffOrdersService } from './staff-orders.service.js';

export const createStaffOrdersController = (service: StaffOrdersService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.list(listStaffOrdersQuery.parse(req.query), req.staff!));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id)));
  },

  async transition(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.transition(String(req.params.id), req.body, req.staff!),
      201,
      'Commande mise à jour.',
    );
  },

});
