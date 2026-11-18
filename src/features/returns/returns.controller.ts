import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { ReturnsService } from './returns.service.js';

export const createReturnsController = (service: ReturnsService) => ({
  async request(req: Request, res: Response) {
    const ret = await service.request(req.customer!.id, String(req.params.id), req.body);
    return sendSuccess(res, ret, 201, 'Demande de retour envoyée : la boutique vous répondra rapidement.');
  },

  async signEvidenceUpload(req: Request, res: Response) {
    // Une signature ne se met jamais en cache : elle porte un horodatage et vaut une heure
    res.setHeader('Cache-Control', 'no-store');
    const upload = await service.signEvidenceUpload(req.customer!.id, String(req.params.id));
    return sendSuccess(res, upload, 201, 'Autorisation d’envoi créée.');
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(req.customer!.id, String(req.params.id)));
  },

  async reopen(req: Request, res: Response) {
    const ret = await service.reopen(req.customer!.id, String(req.params.id), req.body.comment);
    return sendSuccess(res, ret, 201, 'Demande de réouverture envoyée.');
  },
});
