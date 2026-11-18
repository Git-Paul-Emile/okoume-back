import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffReturnsController } from './staff-returns.controller.js';
import {
  inspectionBody,
  listStaffReturnsQuery,
  returnDecisionBody,
  writeOffBody,
  writeOffParams,
} from './staff-returns.schemas.js';
import type { StaffReturnsService } from './staff-returns.service.js';

/**
 * Dossiers de retour, sous /api/v1/staff/returns : chaque étape est une ressource créée (décision, réception,
 * inspection, remise en stock). Droits vérifiés par le service selon l'étape.
 */
export const createStaffReturnsRoutes = (
  service: StaffReturnsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffReturnsController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', validate({ query: listStaffReturnsQuery }), asyncHandler(c.list));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  router.post('/:id/decision', validate({ params: idParam, body: returnDecisionBody }), asyncHandler(c.decide));
  router.post('/:id/reception', validate({ params: idParam }), asyncHandler(c.receive));
  router.post('/:id/inspection', validate({ params: idParam, body: inspectionBody }), asyncHandler(c.inspect));
  router.post('/:id/restock', validate({ params: idParam }), asyncHandler(c.restock));
  return router;
};

/**
 * Sortie définitive du stock non revendable, sous /api/v1/staff/variants/:variantId/write-offs.
 * La session est exigée sur la route seule, pour ne pas s'appliquer aux autres chemins /staff/variants.
 */
export const createWriteOffRoutes = (
  service: StaffReturnsService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffReturnsController(service);
  const router = Router();
  router.post(
    '/:variantId/write-offs',
    requireStaff(authenticator, now),
    validate({ params: writeOffParams, body: writeOffBody }),
    asyncHandler(c.writeOff),
  );
  return router;
};
