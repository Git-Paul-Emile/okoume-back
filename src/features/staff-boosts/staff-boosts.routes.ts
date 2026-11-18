import { Router, type Request, type Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import {
  boostDecisionBody,
  createBoostPlanBody,
  listBoostsQuery,
  updateBoostPlanBody,
} from '../boosts/boosts.schemas.js';
import type { StaffBoostsService } from './staff-boosts.service.js';

export const createStaffBoostsController = (service: StaffBoostsService) => ({
  async plans(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.plans(req.staff!));
  },
  async createPlan(req: Request, res: Response) {
    return sendSuccess(res, await service.createPlan(req.body, req.staff!), 201, 'Offre créée.');
  },
  async updatePlan(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.updatePlan(String(req.params.id), req.body, req.staff!),
      200,
      'Offre modifiée.',
    );
  },
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list(listBoostsQuery.parse(req.query), req.staff!));
  },
  async decide(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.decide(String(req.params.id), req.body, req.staff!),
      200,
      'Décision enregistrée.',
    );
  },
});

/** Offres, sous /staff/boost-plans, et vérification des mises en avant, sous /staff/boosts ; droits vendeurs:*. */
export const createStaffBoostsRoutes = (
  service: StaffBoostsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffBoostsController(service);
  const staffOnly = requireStaff(authenticator, now);

  const plans = Router();
  plans.use(staffOnly);
  plans.get('/', asyncHandler(c.plans));
  plans.post('/', validate({ body: createBoostPlanBody }), asyncHandler(c.createPlan));
  plans.patch('/:id', validate({ params: idParam, body: updateBoostPlanBody }), asyncHandler(c.updatePlan));

  const boosts = Router();
  boosts.use(staffOnly);
  boosts.get('/', validate({ query: listBoostsQuery }), asyncHandler(c.list));
  boosts.patch('/:id', validate({ params: idParam, body: boostDecisionBody }), asyncHandler(c.decide));

  return { plans, boosts };
};
