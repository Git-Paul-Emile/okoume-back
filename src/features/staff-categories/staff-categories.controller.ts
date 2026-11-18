import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { StaffCategoriesService } from './staff-categories.service.js';

export const createStaffCategoriesController = (service: StaffCategoriesService) => ({
  async list(_req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list());
  },

  async create(req: Request, res: Response) {
    return sendSuccess(res, await service.create(req.body, req.staff!), 201, 'Catégorie créée.');
  },

  async update(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.update(String(req.params.id), req.body, req.staff!),
      200,
      'Catégorie modifiée.',
    );
  },

  async remove(req: Request, res: Response) {
    await service.remove(String(req.params.id), req.staff!);
    return res.status(204).end();
  },
});
