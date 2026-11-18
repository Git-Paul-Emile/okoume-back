import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { ShopAssistantService } from './shop-assistant.service.js';

export const createShopAssistantController = (service: ShopAssistantService) => ({
  async answer(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.answer(req.body));
  },
});
