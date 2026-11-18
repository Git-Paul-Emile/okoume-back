import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listStaffProductsQuery, priceChangesQuery } from './staff-catalog.schemas.js';
import type { StaffCatalogService } from './staff-catalog.service.js';

export const createStaffCatalogController = (service: StaffCatalogService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.list(listStaffProductsQuery.parse(req.query), req.staff!));
  },

  async priceChanges(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.priceChanges(priceChangesQuery.parse(req.query), req.staff!));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id)));
  },

  async create(req: Request, res: Response) {
    return sendSuccess(res, await service.create(req.body, req.staff!), 201, 'Produit créé.');
  },

  async update(req: Request, res: Response) {
    return sendSuccess(res, await service.update(String(req.params.id), req.body, req.staff!), 200, 'Produit modifié.');
  },

  async setStatus(req: Request, res: Response) {
    return sendSuccess(res, await service.setStatus(String(req.params.id), req.body.status, req.staff!));
  },

  async addVariant(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.addVariant(String(req.params.id), req.body, req.staff!),
      201,
      'Variante ajoutée.',
    );
  },

  async updateVariant(req: Request, res: Response) {
    const product = await service.updateVariant(
      String(req.params.id),
      String(req.params.variantId),
      req.body,
      req.staff!,
    );
    return sendSuccess(res, product, 200, 'Variante modifiée.');
  },
});
