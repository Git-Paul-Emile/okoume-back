import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listShopsQuery } from './staff-shops.schemas.js';
import type { StaffShopsService } from './staff-shops.service.js';

export const createStaffShopsController = (service: StaffShopsService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list(listShopsQuery.parse(req.query), req.staff!));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id), req.staff!));
  },

  async act(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.act(String(req.params.id), req.body, req.staff!),
      200,
      'Boutique mise à jour.',
    );
  },
});
