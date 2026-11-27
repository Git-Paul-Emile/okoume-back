import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { AccountService } from './account.service.js';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. Données privées : jamais en cache. */
export const createAccountController = (service: AccountService) => ({
  async updateProfile(req: Request, res: Response) {
    return sendSuccess(res, await service.updateProfile(req.customer!.id, req.body), 200, 'Profil enregistré.');
  },

  async addresses(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.addresses(req.customer!.id));
  },

  async addAddress(req: Request, res: Response) {
    return sendSuccess(res, await service.addAddress(req.customer!.id, req.body), 201, 'Adresse ajoutée.');
  },

  async updateAddress(req: Request, res: Response) {
    const address = await service.updateAddress(req.customer!.id, String(req.params.id), req.body);
    return sendSuccess(res, address, 200, 'Adresse mise à jour.');
  },

  async removeAddress(req: Request, res: Response) {
    await service.removeAddress(req.customer!.id, String(req.params.id));
    return res.status(204).end();
  },

});
