import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { journalQuery, listMovementsQuery } from './staff-stock.schemas.js';
import type { StaffStockService } from './staff-stock.service.js';

export const createStaffStockController = (service: StaffStockService) => ({
  async move(req: Request, res: Response) {
    const result = await service.move(String(req.params.variantId), req.body, req.staff!);
    return sendSuccess(res, result, 201, 'Stock mis à jour.');
  },

  async history(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.history(String(req.params.variantId), listMovementsQuery.parse(req.query)));
  },

  async journal(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.journal(journalQuery.parse(req.query), req.staff!));
  },
});
