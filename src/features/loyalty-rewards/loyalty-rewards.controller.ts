import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listReferralsQuery } from './loyalty-rewards.schemas.js';
import type { LoyaltyRewardsService } from './loyalty-rewards.service.js';

export const createLoyaltyRewardsController = (service: LoyaltyRewardsService) => ({
  async referral(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.referral(req.customer!.id));
  },

  async personalCodes(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.personalCodes(req.customer!.id));
  },

  async updatePreferences(req: Request, res: Response) {
    await service.updatePreferences(req.customer!.id, req.body);
    return res.status(204).end();
  },

  async listReferrals(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.listReferrals(listReferralsQuery.parse(req.query), req.staff!));
  },

  async decideReferral(req: Request, res: Response) {
    await service.decideReferral(String(req.params.id), req.body.status === 'granted', req.body.note, req.staff!);
    return res.status(204).end();
  },
});
