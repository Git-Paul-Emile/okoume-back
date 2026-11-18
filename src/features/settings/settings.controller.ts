import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { SettingsService } from './settings.service.js';

export const createSettingsController = (service: SettingsService) => ({
  /** Mêmes réglages pour tous les visiteurs : cache court, partagé par les intermédiaires. */
  async publicSettings(_req: Request, res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return sendSuccess(res, await service.publicSettings());
  },

  async information(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.information(req.staff!));
  },

  async updateInformation(req: Request, res: Response) {
    return sendSuccess(res, await service.updateInformation(req.body, req.staff!), 200, 'Réglages enregistrés.');
  },
});
