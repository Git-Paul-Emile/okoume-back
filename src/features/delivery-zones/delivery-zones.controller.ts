import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { DeliveryZonesService } from './delivery-zones.service.js';

const PUBLIC_CACHE = 'public, max-age=300';

export const createDeliveryZonesController = (service: DeliveryZonesService) => ({
  async list(_req: Request, res: Response) {
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    return sendSuccess(res, await service.list());
  },
});
