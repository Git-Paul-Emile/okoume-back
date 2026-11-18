import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listProductReviewsQuery, listStaffReviewsQuery } from './reviews.schemas.js';
import type { ReviewsService } from './reviews.service.js';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. */
export const createReviewsController = (service: ReviewsService) => ({
  async ratings(_req: Request, res: Response) {
    // Notes publiques : quelques minutes de retard après une modération sont acceptables
    res.setHeader('Cache-Control', 'public, max-age=300');
    return sendSuccess(res, await service.ratings());
  },

  async forProduct(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return sendSuccess(
      res,
      await service.forProduct(String(req.params.productId), listProductReviewsQuery.parse(req.query)),
    );
  },

  async signPhotoUpload(_req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, service.signPhotoUpload(), 201, 'Autorisation d’envoi créée.');
  },

  async mine(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.mine(req.customer!.id, String(req.params.productId)));
  },

  async save(req: Request, res: Response) {
    const review = await service.save(req.customer!.id, String(req.params.productId), req.body);
    return sendSuccess(res, review, 200, 'Avis enregistré : il sera publié après vérification.');
  },

  async report(req: Request, res: Response) {
    await service.report(String(req.params.id), req.customer!.id, req.body.reason);
    return res.status(204).end();
  },

  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list(listStaffReviewsQuery.parse(req.query), req.staff!));
  },

  async decide(req: Request, res: Response) {
    const review = await service.decide(String(req.params.id), req.body, req.staff!);
    return sendSuccess(res, review, 200, review.status === 'approved' ? 'Avis publié.' : 'Avis masqué.');
  },
});
