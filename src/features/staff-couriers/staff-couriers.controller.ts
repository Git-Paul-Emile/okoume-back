import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listCouriersQuery } from './staff-couriers.schemas.js';
import type { StaffCouriersService } from './staff-couriers.service.js';

export const createStaffCouriersController = (service: StaffCouriersService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.list(listCouriersQuery.parse(req.query), req.staff!));
  },

  async create(req: Request, res: Response) {
    return sendSuccess(res, await service.create(req.body, req.staff!), 201, 'Livreur ajouté.');
  },

  async update(req: Request, res: Response) {
    return sendSuccess(res, await service.update(String(req.params.id), req.body, req.staff!), 200, 'Livreur modifié.');
  },
});
