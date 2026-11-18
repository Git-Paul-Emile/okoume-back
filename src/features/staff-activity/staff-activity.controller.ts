import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listActivityQuery } from './staff-activity.schemas.js';
import type { StaffActivityService } from './staff-activity.service.js';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. */
export const createStaffActivityController = (service: StaffActivityService) => ({
  async recordExport(req: Request, res: Response) {
    await service.recordExport(req.body, req.staff!);
    return sendSuccess(res, null, 201, 'Export enregistré au journal.');
  },

  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list(listActivityQuery.parse(req.query), req.staff!));
  },
});
