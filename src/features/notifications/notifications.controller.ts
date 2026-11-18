import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { PushOwner } from './notifications.repository.js';
import type { NotificationsService } from './notifications.service.js';

/** Navigateur de l'appareil, pour que le compte reconnaisse ses appareils ; tronqué, jamais exigé. */
const userAgentOf = (req: Request) => req.get('user-agent')?.slice(0, 300) ?? null;

const ownerOf = (req: Request): PushOwner => (req.staff ? { staffId: req.staff.id } : { customerId: req.customer!.id });

export const createNotificationsController = (service: NotificationsService) => ({
  async publicKey(_req: Request, res: Response) {
    return sendSuccess(res, service.publicKey());
  },

  async subscribe(req: Request, res: Response) {
    await service.subscribe(ownerOf(req), req.body, userAgentOf(req));
    return res.status(204).end();
  },

  async unsubscribe(req: Request, res: Response) {
    await service.unsubscribe(ownerOf(req), req.body.endpoint);
    return res.status(204).end();
  },

  async preferences(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.preferences(req.customer!.id));
  },

  async updatePreferences(req: Request, res: Response) {
    return sendSuccess(res, await service.updatePreferences(req.customer!.id, req.body));
  },
});
