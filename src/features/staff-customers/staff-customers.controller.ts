import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listCustomersQuery } from './staff-customers.schemas.js';
import type { StaffCustomersService } from './staff-customers.service.js';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. Données personnelles : jamais en cache. */
export const createStaffCustomersController = (service: StaffCustomersService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list(listCustomersQuery.parse(req.query), req.staff!));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id), req.staff!));
  },
});
