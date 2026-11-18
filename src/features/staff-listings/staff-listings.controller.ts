import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listListingsQuery, listReportsQuery } from './staff-listings.schemas.js';
import type { StaffListingsService } from './staff-listings.service.js';

export const createStaffListingsController = (service: StaffListingsService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.list(listListingsQuery.parse(req.query), req.staff!));
  },
  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id), req.staff!));
  },
  async decide(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.decide(String(req.params.id), req.body, req.staff!),
      200,
      'Décision enregistrée.',
    );
  },
  async reports(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.reports(listReportsQuery.parse(req.query), req.staff!));
  },
  async decideReport(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.decideReport(String(req.params.id), req.body.status, req.staff!),
      200,
      'Signalement traité.',
    );
  },
});
