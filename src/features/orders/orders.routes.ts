import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { optionalCustomer, requireCustomer } from '../../core/middlewares/authenticate.js';
import { createAuthLimiter, createOrderLimiter } from '../../core/middlewares/rateLimiters.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createOrdersController } from './orders.controller.js';
import {
  cancellationRequestBody,
  claimOrderBody,
  createOrderBody,
  disputeBody,
  feeChangeDecisionBody,
  listOrdersQuery,
  paymentDeclarationBody,
  quoteBody,
  trackedPaymentDeclarationBody,
  trackingQuery,
} from './orders.schemas.js';
import type { OrdersService } from './orders.service.js';

/** Commandes, sous /api/v1/orders : passage de commande (avec ou sans compte), historique du client. */
export const createOrdersRoutes = (service: OrdersService, now: () => Date) => {
  const c = createOrdersController(service);
  const router = Router();
  router.post(
    '/',
    createOrderLimiter(),
    optionalCustomer(now),
    validate({ body: createOrderBody }),
    asyncHandler(c.create),
  );
  router.get('/', requireCustomer(now), validate({ query: listOrdersQuery }), asyncHandler(c.list));
  // Rattachement d'une commande passée sans compte : limite stricte, le code de suivi ne se devine pas par essais
  router.post(
    '/claims',
    createAuthLimiter(),
    requireCustomer(now),
    validate({ body: claimOrderBody }),
    asyncHandler(c.claim),
  );
  router.get('/:id', requireCustomer(now), validate({ params: idParam }), asyncHandler(c.get));
  router.patch(
    '/:id/delivery-fee-change',
    requireCustomer(now),
    validate({ params: idParam, body: feeChangeDecisionBody }),
    asyncHandler(c.decideFeeChange),
  );
  router.post(
    '/:id/delivery-disputes',
    requireCustomer(now),
    validate({ params: idParam, body: disputeBody }),
    asyncHandler(c.disputeDelivery),
  );
  router.post(
    '/:id/payment-declarations',
    requireCustomer(now),
    validate({ params: idParam, body: paymentDeclarationBody }),
    asyncHandler(c.declarePayment),
  );
  router.post(
    '/:id/cancellation-requests',
    requireCustomer(now),
    validate({ params: idParam, body: cancellationRequestBody }),
    asyncHandler(c.cancel),
  );
  return router;
};

/**
 * Suivi d'une commande sans compte, sous /api/v1/order-tracking?number=…&code=…
 * Limite stricte : le code de suivi ne doit pas pouvoir être deviné par essais successifs.
 */
export const createOrderTrackingRoutes = (service: OrdersService) => {
  const c = createOrdersController(service);
  const router = Router();
  router.get('/', createAuthLimiter(), validate({ query: trackingQuery }), asyncHandler(c.track));
  // Déclaration de paiement sans compte : même limite stricte, le code de suivi sert de preuve
  router.post(
    '/payment-declarations',
    createAuthLimiter(),
    validate({ body: trackedPaymentDeclarationBody }),
    asyncHandler(c.declarePaymentByTracking),
  );
  return router;
};

/** Devis du panier, sous /api/v1/checkout/quotes : prix, code et points calculés par l'API, avec ou sans compte. */
export const createCheckoutRoutes = (service: OrdersService, now: () => Date) => {
  const c = createOrdersController(service);
  const router = Router();
  router.post('/quotes', optionalCustomer(now), validate({ body: quoteBody }), asyncHandler(c.quote));
  return router;
};
