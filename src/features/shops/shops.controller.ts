import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { pageQuery } from './shops.schemas.js';
import type { ShopsService } from './shops.service.js';

export const createShopsController = (service: ShopsService) => ({
  async publicShop(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return sendSuccess(res, await service.publicShop(String(req.params.slug)));
  },

  async publicList(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return sendSuccess(res, await service.publicList(pageQuery.parse(req.query)));
  },

  async open(req: Request, res: Response) {
    return sendSuccess(res, await service.open(req.customer!.id, req.body), 201, 'Boutique ouverte.');
  },

  async mine(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.mine(req.customer!.id));
  },

  async update(req: Request, res: Response) {
    return sendSuccess(res, await service.update(req.customer!.id, req.body), 200, 'Boutique modifiée.');
  },
});
