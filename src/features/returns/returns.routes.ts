import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createReturnsController } from './returns.controller.js';
import { reopenBody, returnRequestBody } from './returns.schemas.js';
import type { ReturnsService } from './returns.service.js';

/** Dossier de retour d'une commande du client, sous /api/v1/orders/:id/return (un dossier par commande). */
export const createReturnsRoutes = (service: ReturnsService, now: () => Date) => {
  const c = createReturnsController(service);
  const customerOnly = requireCustomer(now);
  const router = Router();
  router.post(
    '/:id/return',
    customerOnly,
    validate({ params: idParam, body: returnRequestBody }),
    asyncHandler(c.request),
  );
  router.post(
    '/:id/return/evidence-uploads',
    customerOnly,
    validate({ params: idParam }),
    asyncHandler(c.signEvidenceUpload),
  );
  router.get('/:id/return', customerOnly, validate({ params: idParam }), asyncHandler(c.get));
  router.post(
    '/:id/return/reopenings',
    customerOnly,
    validate({ params: idParam, body: reopenBody }),
    asyncHandler(c.reopen),
  );
  return router;
};
