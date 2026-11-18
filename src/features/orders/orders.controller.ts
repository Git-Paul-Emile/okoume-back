import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listOrdersQuery, trackingQuery } from './orders.schemas.js';
import type { OrdersService } from './orders.service.js';

export const createOrdersController = (service: OrdersService) => ({
  /** 201 à la création, 200 quand la même clé renvoie la commande déjà créée. */
  async create(req: Request, res: Response) {
    const { order, created } = await service.place(req.body, req.customer?.id ?? null);
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, order, created ? 201 : 200, created ? 'Commande confirmée.' : 'Commande déjà enregistrée.');
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

  /** 200 si la commande est annulée tout de suite, 202 si la demande attend la décision de l'équipe. */
  async cancel(req: Request, res: Response) {
    const { order, direct } = await service.cancelOwn(req.customer!.id, String(req.params.id), req.body);
    return sendSuccess(
      res,
      order,
      direct ? 200 : 202,
      direct ? 'Commande annulée.' : 'Demande d’annulation envoyée : la boutique vous répondra rapidement.',
    );
  },

  async decideFeeChange(req: Request, res: Response) {
    const accepted = req.body.status === 'accepted';
    const order = await service.decideFeeChange(req.customer!.id, String(req.params.id), accepted);
    return sendSuccess(res, order, 200, accepted ? 'Nouveaux frais acceptés.' : 'Nouveaux frais refusés.');
  },

  async disputeDelivery(req: Request, res: Response) {
    const order = await service.disputeDelivery(req.customer!.id, String(req.params.id), req.body.reason);
    return sendSuccess(res, order, 201, 'Réclamation ouverte : la boutique vous recontacte rapidement.');
  },

  async claim(req: Request, res: Response) {
    const order = await service.claim(req.customer!.id, req.body.number, req.body.code);
    return sendSuccess(res, order, 200, 'Commande ajoutée à votre compte.');
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
