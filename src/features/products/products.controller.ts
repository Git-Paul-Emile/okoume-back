import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listProductsQuery } from './products.schemas.js';
import type { ProductsService } from './products.service.js';

/** Catalogue public : cache court, car le stock disponible et les promotions changent. */
const PUBLIC_CACHE = 'public, max-age=60';

export const createProductsController = (service: ProductsService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    // Query déjà validée par le middleware (erreur 400 sinon) ; le schéma étant idempotent, parse redonne son type exact
    return sendSuccess(res, await service.list(listProductsQuery.parse(req.query)));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    return sendSuccess(res, await service.getBySlug(String(req.params.slug)));
  },
});
