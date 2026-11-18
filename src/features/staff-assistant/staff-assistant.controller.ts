import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { StaffAssistantService } from './staff-assistant.service.js';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. */
export const createStaffAssistantController = (service: StaffAssistantService) => ({
  async overview(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.overview(req.staff!));
  },
  async decide(req: Request, res: Response) {
    return sendSuccess(res, await service.decide(req.body, req.staff!), 201, 'Décision enregistrée.');
  },
  async recordAction(req: Request, res: Response) {
    return sendSuccess(res, await service.recordAction(req.body, req.staff!), 201, 'Proposition appliquée.');
  },
  async revertAction(req: Request, res: Response) {
    return sendSuccess(res, await service.revertAction(String(req.params.id), req.staff!), 200, 'Action annulée.');
  },
  async saveRules(req: Request, res: Response) {
    return sendSuccess(res, await service.saveRules(req.body, req.staff!), 201, 'Règles enregistrées.');
  },
  async questions(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.questions(req.staff!));
  },
  async logQuestion(req: Request, res: Response) {
    return sendSuccess(res, await service.logQuestion(req.body, req.staff!), 201);
  },
});
