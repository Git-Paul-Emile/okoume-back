import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createPaymentsController } from './payments.controller.js';
import { paymentMethodBody } from './payments.schemas.js';
import type { PaymentsService } from './payments.service.js';

/** Moyen de paiement d'une commande du client, sous /api/v1/orders/:id/payment-method. */
export const createPaymentsRoutes = (service: PaymentsService, now: () => Date) => {
  const c = createPaymentsController(service);
  const router = Router();
  router.put(
    '/:id/payment-method',
    requireCustomer(now),
    validate({ params: idParam, body: paymentMethodBody }),
    asyncHandler(c.changeMethod),
  );
  return router;
};
