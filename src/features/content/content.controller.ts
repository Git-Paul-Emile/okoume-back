import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listAdsQuery } from './content.schemas.js';
import type { ContentService } from './content.service.js';

// Contenus publics : quelques minutes de retard après une modification sont acceptables
const publicCache = (res: Response) => res.setHeader('Cache-Control', 'public, max-age=300');
const privateData = (res: Response) => res.setHeader('Cache-Control', 'no-store');

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. */
export const createContentController = (service: ContentService) => ({
  async banners(_req: Request, res: Response) {
    publicCache(res);
    return sendSuccess(res, await service.banners());
  },
  async ads(req: Request, res: Response) {
    publicCache(res);
    return sendSuccess(res, await service.ads(listAdsQuery.parse(req.query).placement));
  },
  async offers(_req: Request, res: Response) {
    publicCache(res);
    return sendSuccess(res, await service.offers());
  },
  async articles(_req: Request, res: Response) {
    publicCache(res);
    return sendSuccess(res, await service.articles());
  },
  async article(req: Request, res: Response) {
    publicCache(res);
    return sendSuccess(res, await service.article(String(req.params.slug)));
  },
  async legalPages(_req: Request, res: Response) {
    publicCache(res);
    return sendSuccess(res, await service.legalPages());
  },

  async staffBanners(req: Request, res: Response) {
    privateData(res);
    return sendSuccess(res, await service.staffBanners(req.staff!));
  },
  async updateBanner(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.updateBanner(String(req.params.id), req.body, req.staff!),
      200,
      'Bannière enregistrée.',
    );
  },
  async staffAds(req: Request, res: Response) {
    privateData(res);
    return sendSuccess(res, await service.staffAds(req.staff!));
  },
  async updateAd(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.updateAd(String(req.params.id), req.body, req.staff!),
      200,
      'Espace publicitaire enregistré.',
    );
  },
  async staffArticles(req: Request, res: Response) {
    privateData(res);
    return sendSuccess(res, await service.staffArticles(req.staff!));
  },
  async createArticle(req: Request, res: Response) {
    return sendSuccess(res, await service.createArticle(req.body, req.staff!), 201, 'Article créé.');
  },
  async updateArticle(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.updateArticle(String(req.params.id), req.body, req.staff!),
      200,
      'Article enregistré.',
    );
  },
  async staffLegalPages(req: Request, res: Response) {
    privateData(res);
    return sendSuccess(res, await service.staffLegalPages(req.staff!));
  },
  async saveLegalPage(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.saveLegalPage(String(req.params.slug), req.body, req.staff!),
      200,
      'Page enregistrée.',
    );
  },
});
