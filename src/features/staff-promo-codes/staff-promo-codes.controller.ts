import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listPromoCodesQuery } from './staff-promo-codes.schemas.js';
import type { StaffPromoCodesService } from './staff-promo-codes.service.js';

export const createStaffPromoCodesController = (service: StaffPromoCodesService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.list(listPromoCodesQuery.parse(req.query), req.staff!));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id), req.staff!));
  },

  async create(req: Request, res: Response) {
    return sendSuccess(res, await service.create(req.body, req.staff!), 201, 'Code créé.');
  },

  async update(req: Request, res: Response) {
    return sendSuccess(res, await service.update(String(req.params.id), req.body, req.staff!), 200, 'Code modifié.');
  },
});
