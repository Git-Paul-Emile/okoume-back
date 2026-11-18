import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { windowQuery } from './analytics.schemas.js';
import type { AnalyticsService } from './analytics.service.js';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. */
export const createAnalyticsController = (service: AnalyticsService) => ({
  async record(req: Request, res: Response) {
    await service.record(req.body);
    return res.status(204).end();
  },

  async assistantUsage(_req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.assistantUsage());
  },

  async consumeAssistant(_req: Request, res: Response) {
    return sendSuccess(res, await service.consumeAssistant(), 201);
  },

  async productEvents(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.productEvents(windowQuery.parse(req.query), req.staff!));
  },

  async searches(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.searches(windowQuery.parse(req.query), req.staff!));
  },

  async daily(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.daily(windowQuery.parse(req.query), req.staff!));
  },
});
