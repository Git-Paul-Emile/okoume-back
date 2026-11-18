import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { pageQuery } from './shops.schemas.js';
import type { ShopsService } from './shops.service.js';

export const createShopsController = (service: ShopsService) => ({
  async plans(_req: Request, res: Response) {
    // Les offres changent rarement : quelques minutes de cache suffisent
    res.setHeader('Cache-Control', 'public, max-age=300');
    return sendSuccess(res, await service.plans());
  },

  async publicShop(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return sendSuccess(res, await service.publicShop(String(req.params.slug)));
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

  async changePlan(req: Request, res: Response) {
    return sendSuccess(res, await service.changePlan(req.customer!.id, req.body.planId), 200, 'Offre modifiée.');
  },

  async declarePayment(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.declarePayment(req.customer!.id, req.body),
      201,
      'Paiement déclaré : il sera vérifié par l’administration.',
    );
  },

  async payments(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.payments(req.customer!.id, pageQuery.parse(req.query)));
  },
});
