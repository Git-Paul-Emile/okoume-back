import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { StaffLoyaltyService } from './staff-loyalty.service.js';

export const createStaffLoyaltyController = (service: StaffLoyaltyService) => ({
  async adjust(req: Request, res: Response) {
    const result = await service.adjust(String(req.params.customerId), req.body.points, req.body.reason, req.staff!);
    return sendSuccess(res, result, 201, 'Correction enregistrée.');
  },

  async settings(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.settings(req.staff!));
  },

  async updateSettings(req: Request, res: Response) {
    return sendSuccess(res, await service.updateSettings(req.body, req.staff!), 200, 'Réglages enregistrés.');
  },
});
