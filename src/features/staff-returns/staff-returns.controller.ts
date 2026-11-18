import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listStaffReturnsQuery } from './staff-returns.schemas.js';
import type { StaffReturnsService } from './staff-returns.service.js';

export const createStaffReturnsController = (service: StaffReturnsService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.list(listStaffReturnsQuery.parse(req.query), req.staff!));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id), req.staff!));
  },

  async decide(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.decide(String(req.params.id), req.body, req.staff!),
      201,
      'Décision enregistrée.',
    );
  },

  async receive(req: Request, res: Response) {
    return sendSuccess(res, await service.receive(String(req.params.id), req.staff!), 201, 'Réception enregistrée.');
  },

  async inspect(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.inspect(String(req.params.id), req.body, req.staff!),
      201,
      'Inspection enregistrée.',
    );
  },

  async restock(req: Request, res: Response) {
    return sendSuccess(res, await service.restock(String(req.params.id), req.staff!), 201, 'Articles remis en stock.');
  },

  async writeOff(req: Request, res: Response) {
    const result = await service.writeOff(String(req.params.variantId), req.body, req.staff!);
    return sendSuccess(res, result, 201, 'Sortie définitive enregistrée.');
  },
});
