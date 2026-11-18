import type { Request, Response } from 'express';
import { clearAuthCookies } from '../../core/http/authCookies.js';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listPrivacyRequestsQuery } from './privacy.schemas.js';
import type { PrivacyService } from './privacy.service.js';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. Données personnelles : jamais en cache. */
export const createPrivacyController = (service: PrivacyService) => ({
  async mine(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.mine(req.customer!.id));
  },

  async create(req: Request, res: Response) {
    const request = await service.create(req.customer!.id, req.body);
    return sendSuccess(res, request, 201, `Demande ${request.number} envoyée.`);
  },

  async exportMine(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.exportMine(req.customer!.id), 201, 'Export de vos données prêt.');
  },

  async deleteMine(req: Request, res: Response) {
    await service.deleteMine(req.customer!.id, req.body.password);
    clearAuthCookies(res, 'customer');
    return res.status(204).end();
  },

  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list(listPrivacyRequestsQuery.parse(req.query), req.staff!));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id), req.staff!));
  },

  async exportFor(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.exportFor(String(req.params.id), req.staff!), 201, 'Export généré.');
  },

  async update(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.update(String(req.params.id), req.body, req.staff!),
      200,
      'Demande mise à jour.',
    );
  },
});
