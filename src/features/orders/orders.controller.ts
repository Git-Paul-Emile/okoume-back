import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listOrdersQuery, trackingQuery } from './orders.schemas.js';
import type { OrdersService } from './orders.service.js';

export const createOrdersController = (service: OrdersService) => ({
  /** 201 à la création, 200 quand la même clé renvoie la commande déjà créée. */
  async create(req: Request, res: Response) {
    const { order, orders, created } = await service.place(req.body, req.customer?.id ?? null);
    res.setHeader('Cache-Control', 'no-store');
    // La première commande, et toutes celles du même panier (une par boutique, 32.4)
    return sendSuccess(
      res,
      { ...order, checkout: orders },
      created ? 201 : 200,
      created ? 'Commande confirmée.' : 'Commande déjà enregistrée.',
    );
  },

  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.listForCustomer(req.customer!.id, listOrdersQuery.parse(req.query)));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.getForCustomer(req.customer!.id, String(req.params.id)));
  },

  /** Devis du panier, avec ou sans compte : les erreurs de code ou de points sont dans la réponse. */
  async quote(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.quote(req.body, req.customer?.id ?? null));
  },

  async track(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const { number, code } = trackingQuery.parse(req.query);
    return sendSuccess(res, await service.track(number, code));
  },
});
