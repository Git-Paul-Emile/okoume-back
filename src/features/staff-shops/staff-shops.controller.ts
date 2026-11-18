import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listShopPaymentsQuery, listShopsQuery } from './staff-shops.schemas.js';
import type { StaffShopsService } from './staff-shops.service.js';

export const createStaffShopsController = (service: StaffShopsService) => ({
  async plans(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.plans(req.staff!));
  },

  async createPlan(req: Request, res: Response) {
    return sendSuccess(res, await service.createPlan(req.body, req.staff!), 201, 'Offre créée.');
  },

  async updatePlan(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.updatePlan(String(req.params.id), req.body, req.staff!),
      200,
      'Offre modifiée.',
    );
  },

  async settings(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.settings(req.staff!));
  },

  async updateSettings(req: Request, res: Response) {
    return sendSuccess(res, await service.updateSettings(req.body, req.staff!), 200, 'Réglages enregistrés.');
  },

  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.list(listShopsQuery.parse(req.query), req.staff!));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id), req.staff!));
  },

  async act(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.act(String(req.params.id), req.body, req.staff!),
      200,
      'Boutique mise à jour.',
    );
  },

  async payments(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.payments(listShopPaymentsQuery.parse(req.query), req.staff!));
  },

  async decidePayment(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.decidePayment(String(req.params.id), req.body, req.staff!),
      200,
      'Décision enregistrée.',
    );
  },
});
