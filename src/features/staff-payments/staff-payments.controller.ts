import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { StaffPaymentsService } from './staff-payments.service.js';

export const createStaffPaymentsController = (service: StaffPaymentsService) => ({
  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id), req.staff!));
  },
});
