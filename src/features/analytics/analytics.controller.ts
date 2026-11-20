import type { Request, Response } from 'express';
import type { z } from 'zod';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { windowQuery } from './analytics.schemas.js';
import type { AnalyticsService } from './analytics.service.js';

type AnalyticsWindow = z.output<typeof windowQuery>;

// Le middleware validate() a déjà converti from/to en Date.
const validatedWindow = (req: Request): AnalyticsWindow => req.query as unknown as AnalyticsWindow;

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
    return sendSuccess(res, await service.productEvents(validatedWindow(req), req.staff!));
  },

  async searches(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.searches(validatedWindow(req), req.staff!));
  },

  async daily(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.daily(validatedWindow(req), req.staff!));
  },
});
