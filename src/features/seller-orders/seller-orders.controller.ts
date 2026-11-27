import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listSellerOrdersQuery } from './seller-orders.schemas.js';
import type { SellerOrdersService } from './seller-orders.service.js';

/** Le compte connecté est toujours le vendeur : aucune boutique n'est lue dans la requête. */
export const createSellerOrdersController = (service: SellerOrdersService) => {
  const me = (req: Request) => req.customer!.id;
  const id = (req: Request) => String(req.params.id);
  return {
    list: async (req: Request, res: Response) =>
      sendSuccess(res, await service.list(me(req), listSellerOrdersQuery.parse(req.query))),
    get: async (req: Request, res: Response) => sendSuccess(res, await service.get(me(req), id(req))),
    advance: async (req: Request, res: Response) =>
      sendSuccess(res, await service.advance(me(req), id(req), req.body.note), 200, 'Commande mise à jour.'),
    handover: async (req: Request, res: Response) =>
      sendSuccess(res, await service.handover(me(req), id(req)), 200, 'Remise au livreur confirmée.'),
  };
};
