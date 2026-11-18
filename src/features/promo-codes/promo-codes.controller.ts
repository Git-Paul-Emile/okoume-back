import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { PublicPromoCodesService } from './promo-codes.service.js';

export const createPublicPromoCodesController = (service: PublicPromoCodesService) => ({
  /** Les mêmes codes pour tous les visiteurs : cache court, partagé par les intermédiaires. */
  async list(_req: Request, res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return sendSuccess(res, await service.list());
  },
});
