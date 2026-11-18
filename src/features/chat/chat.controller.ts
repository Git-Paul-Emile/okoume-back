import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listConversationsQuery, messagesQuery } from './chat.schemas.js';
import type { ChatService } from './chat.service.js';

/** Date du dernier message déjà reçu, pour ne renvoyer que les nouveaux. */
const sinceOf = (req: Request) => {
  const { since } = messagesQuery.parse(req.query);
  return since ? new Date(since) : undefined;
};

export const createChatController = (service: ChatService) => ({
  async open(req: Request, res: Response) {
    const { created, conversation } = await service.open(req.customer!.id, req.body.listingSlug);
    return sendSuccess(res, conversation, created ? 201 : 200, created ? 'Conversation ouverte.' : 'OK');
  },

  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list(req.customer!.id, listConversationsQuery.parse(req.query)));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(req.customer!.id, String(req.params.id), sinceOf(req)));
  },

  async send(req: Request, res: Response) {
    return sendSuccess(res, await service.send(req.customer!.id, String(req.params.id), req.body.body), 201, 'Envoyé.');
  },

  async close(req: Request, res: Response) {
    return sendSuccess(res, await service.close(req.customer!.id, String(req.params.id)), 200, 'Conversation close.');
  },

  async sellerList(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.sellerList(req.customer!.id, listConversationsQuery.parse(req.query)));
  },

  async sellerGet(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.sellerGet(req.customer!.id, String(req.params.id), sinceOf(req)));
  },

  async sellerSend(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.sellerSend(req.customer!.id, String(req.params.id), req.body.body),
      201,
      'Envoyé.',
    );
  },

  async sellerAgreement(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.sellerAgreement(req.customer!.id, String(req.params.id), req.body.price),
      200,
      'Prix proposé.',
    );
  },
});
