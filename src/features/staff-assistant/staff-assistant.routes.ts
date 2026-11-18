import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffAssistantController } from './staff-assistant.controller.js';
import { actionBody, decisionBody, questionBody, rulesBody } from './staff-assistant.schemas.js';
import type { StaffAssistantService } from './staff-assistant.service.js';

/** Mémoire de l'assistant d'administration, sous /api/v1/staff/assistant. */
export const createStaffAssistantRoutes = (
  service: StaffAssistantService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffAssistantController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', asyncHandler(c.overview));
  router.post('/decisions', validate({ body: decisionBody }), asyncHandler(c.decide));
  router.post('/actions', validate({ body: actionBody }), asyncHandler(c.recordAction));
  router.post('/actions/:id/reversions', validate({ params: idParam }), asyncHandler(c.revertAction));
  router.post('/rules', validate({ body: rulesBody }), asyncHandler(c.saveRules));
  router.get('/questions', asyncHandler(c.questions));
  router.post('/questions', validate({ body: questionBody }), asyncHandler(c.logQuestion));
  return router;
};
