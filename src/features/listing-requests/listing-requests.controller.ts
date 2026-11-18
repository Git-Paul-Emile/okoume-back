import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listRequestsQuery } from './listing-requests.schemas.js';
import type { ListingRequestsService } from './listing-requests.service.js';

export const createListingRequestsController = (service: ListingRequestsService) => ({
  async create(req: Request, res: Response) {
    return sendSuccess(res, await service.create(req.customer!.id, req.body), 201, 'Demande envoyée au vendeur.');
  },

  async buyerList(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.buyerList(req.customer!.id, listRequestsQuery.parse(req.query)));
  },

  async buyerGet(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.buyerGet(req.customer!.id, String(req.params.id)));
  },

  async cancel(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.cancel(req.customer!.id, String(req.params.id), req.body.reason),
      200,
      'Demande annulée.',
    );
  },

  async sellerList(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.sellerList(req.customer!.id, listRequestsQuery.parse(req.query)));
  },

  async sellerGet(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.sellerGet(req.customer!.id, String(req.params.id)));
  },

  async sellerAct(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.sellerAct(req.customer!.id, String(req.params.id), req.body),
      200,
      'Demande mise à jour.',
    );
  },
});
