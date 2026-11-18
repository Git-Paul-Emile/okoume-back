import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listMyTicketsQuery, listStaffTicketsQuery } from './support.schemas.js';
import type { SupportService } from './support.service.js';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. Données privées : jamais en cache. */
export const createSupportController = (service: SupportService) => ({
  async signAttachmentUpload(_req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, service.signAttachmentUpload(), 201, 'Autorisation d’envoi créée.');
  },

  async create(req: Request, res: Response) {
    const ticket = await service.create(req.body, req.customer?.id ?? null);
    return sendSuccess(res, ticket, 201, `Demande ${ticket.number} envoyée.`);
  },

  async mine(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.mine(req.customer!.id, listMyTicketsQuery.parse(req.query)));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(req.customer!.id, String(req.params.number)));
  },

  async reply(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.reply(req.customer!.id, String(req.params.number), req.body),
      201,
      'Message envoyé.',
    );
  },

  async reopen(req: Request, res: Response) {
    const ticket = await service.reopen(req.customer!.id, String(req.params.number), req.body.reason);
    return sendSuccess(res, ticket, 200, 'Demande rouverte.');
  },

  async rate(req: Request, res: Response) {
    const ticket = await service.rate(req.customer!.id, String(req.params.number), req.body.score);
    return sendSuccess(res, ticket, 200, 'Merci pour votre note.');
  },

  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list(listStaffTicketsQuery.parse(req.query), req.staff!));
  },

  async staffGet(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.staffGet(String(req.params.id), req.staff!));
  },

  async answer(req: Request, res: Response) {
    const ticket = await service.answer(String(req.params.id), req.body.body, req.staff!);
    return sendSuccess(res, ticket, 201, 'Réponse envoyée au client.');
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
