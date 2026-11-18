import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listStaffOrdersQuery } from './staff-orders.schemas.js';
import type { StaffOrdersService } from './staff-orders.service.js';

export const createStaffOrdersController = (service: StaffOrdersService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.list(listStaffOrdersQuery.parse(req.query), req.staff!));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id)));
  },

  async transition(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.transition(String(req.params.id), req.body, req.staff!),
      201,
      'Commande mise à jour.',
    );
  },

  async clearReview(req: Request, res: Response) {
    const order = await service.clearReview(String(req.params.id), req.body.note, req.staff!);
    return sendSuccess(res, order, 200, 'Commande vérifiée : la préparation peut commencer.');
  },

  async setDeliveryCost(req: Request, res: Response) {
    return sendSuccess(res, await service.setDeliveryCost(String(req.params.id), req.body.amount, req.staff!));
  },

  async proposeFeeChange(req: Request, res: Response) {
    const order = await service.proposeFeeChange(String(req.params.id), req.body, req.staff!);
    return sendSuccess(res, order, 201, 'Nouveaux frais proposés au client.');
  },

  async resolveDispute(req: Request, res: Response) {
    return sendSuccess(res, await service.resolveDispute(String(req.params.id), req.body.resolution, req.staff!));
  },

  async decideCancellation(req: Request, res: Response) {
    return sendSuccess(res, await service.decideCancellation(String(req.params.id), req.body, req.staff!));
  },
});
