import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { StaffAlertsService } from './staff-alerts.service.js';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. */
export const createStaffAlertsController = (service: StaffAlertsService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list(req.staff!));
  },

  async update(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.update(String(req.params.id), req.body, req.staff!),
      200,
      'Alerte mise à jour.',
    );
  },
});
