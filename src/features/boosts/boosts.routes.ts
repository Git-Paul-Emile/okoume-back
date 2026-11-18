import { Router, type Request, type Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { boostsPageQuery, declareBoostBody } from './boosts.schemas.js';
import type { BoostsService } from './boosts.service.js';

export const createBoostsController = (service: BoostsService) => ({
  async plans(_req: Request, res: Response) {
    // Les offres changent rarement : quelques minutes de cache suffisent
    res.setHeader('Cache-Control', 'public, max-age=300');
    return sendSuccess(res, await service.plans());
  },

  async declare(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.declare(req.customer!.id, String(req.params.id), req.body),
      201,
      'Paiement déclaré : il sera vérifié par l’administration.',
    );
  },

  async mine(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.mine(req.customer!.id, boostsPageQuery.parse(req.query)));
  },
});

/** Offres de mise en avant proposées aux vendeurs, sous /api/v1/boost-plans (public). */
export const createBoostPlansRoutes = (service: BoostsService) => {
  const c = createBoostsController(service);
  const router = Router();
  router.get('/', asyncHandler(c.plans));
  return router;
};

/**
 * Mises en avant du vendeur connecté, sous /api/v1/seller : déclarer le paiement d'une mise en avant d'annonce,
 * consulter l'historique. Authentification par route : ce routeur ne doit pas intercepter les autres chemins.
 */
export const createSellerBoostsRoutes = (service: BoostsService, now: () => Date) => {
  const c = createBoostsController(service);
  const customerOnly = requireCustomer(now);
  const router = Router();
  router.post(
    '/listings/:id/boosts',
    customerOnly,
    validate({ params: idParam, body: declareBoostBody }),
    asyncHandler(c.declare),
  );
  router.get('/boosts', customerOnly, validate({ query: boostsPageQuery }), asyncHandler(c.mine));
  return router;
};
