import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { StaffPaymentsService } from './staff-payments.service.js';

export const createStaffPaymentsController = (service: StaffPaymentsService) => ({
  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id), req.staff!));
  },

  async record(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.record(String(req.params.id), req.body, req.staff!),
      201,
      'Paiement enregistré.',
    );
  },

  async refund(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.refund(String(req.params.id), req.body, req.staff!),
      201,
      'Remboursement enregistré.',
    );
  },
});
