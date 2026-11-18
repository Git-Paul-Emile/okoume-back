import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { CategoriesService } from './categories.service.js';

/** Données publiques et peu changeantes : mises en cache 5 minutes par le navigateur et les proxys. */
const PUBLIC_CACHE = 'public, max-age=300';

export const createCategoriesController = (service: CategoriesService) => ({
  async list(_req: Request, res: Response) {
    res.setHeader('Cache-Control', PUBLIC_CACHE);
    return sendSuccess(res, await service.list());
  },
});
