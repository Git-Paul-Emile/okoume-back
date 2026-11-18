import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { StaffZonesService } from './staff-delivery-zones.service.js';

export const createStaffZonesController = (service: StaffZonesService) => ({
  async list(_req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list());
  },

  async create(req: Request, res: Response) {
    return sendSuccess(res, await service.create(req.body, req.staff!), 201, 'Zone créée.');
  },

  async update(req: Request, res: Response) {
    return sendSuccess(res, await service.update(String(req.params.id), req.body, req.staff!), 200, 'Zone modifiée.');
  },
});
