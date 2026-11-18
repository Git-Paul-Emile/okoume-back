import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listingsSearchQuery, listMyListingsQuery, publicPageQuery } from './listings.schemas.js';
import type { ListingsService } from './listings.service.js';

export const createListingsController = (service: ListingsService) => ({
  async signPhotoUpload(req: Request, res: Response) {
    // Une signature ne se met jamais en cache : elle porte un horodatage et vaut une heure
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.signPhotoUpload(req.customer!.id), 201, 'Autorisation d’envoi créée.');
  },

  async create(req: Request, res: Response) {
    return sendSuccess(res, await service.create(req.customer!.id, req.body), 201, 'Brouillon enregistré.');
  },

  async mine(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.mine(req.customer!.id, listMyListingsQuery.parse(req.query)));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(req.customer!.id, String(req.params.id)));
  },

  async update(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.update(req.customer!.id, String(req.params.id), req.body),
      200,
      'Annonce modifiée.',
    );
  },

  async changeStatus(req: Request, res: Response) {
    const id = String(req.params.id);
    return req.body.action === 'submit'
      ? sendSuccess(res, await service.submit(req.customer!.id, id), 200, 'Annonce soumise à vérification.')
      : sendSuccess(res, await service.withdraw(req.customer!.id, id), 200, 'Annonce retirée.');
  },

  async search(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return sendSuccess(res, await service.search(listingsSearchQuery.parse(req.query)));
  },

  /** Réponse propre à une position : jamais mise en cache, ni par le navigateur ni par un intermédiaire. */
  async searchNearby(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.search(req.body));
  },

  /** Pas de cache partagé : chaque consultation compte une visite (32.8). */
  async publicListing(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'private, max-age=60');
    return sendSuccess(res, await service.publicListing(String(req.params.slug), req.customer?.id));
  },

  async share(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.share(req.customer!.id, String(req.params.id)));
  },

  async shopListings(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return sendSuccess(res, await service.shopListings(String(req.params.slug), publicPageQuery.parse(req.query)));
  },

  async report(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.report(req.customer!.id, String(req.params.slug), req.body),
      201,
      'Merci : l’annonce sera examinée.',
    );
  },
});
