import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requirePermission, requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { createStaffStockController } from './staff-stock.controller.js';
import { journalQuery, listMovementsQuery, stockMovementBody, variantParams } from './staff-stock.schemas.js';
import type { StaffStockService } from './staff-stock.service.js';

/**
 * Mouvements de stock d'une variante, sous /api/v1/staff/variants/:variantId/stock-movements.
 * Lecture : stock:consulter. Réception et inventaire : droit vérifié par le service selon le type.
 */
export const createStaffStockRoutes = (
  service: StaffStockService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffStockController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now), requirePermission('stock:consulter'));
  router.get(
    '/:variantId/stock-movements',
    validate({ params: variantParams, query: listMovementsQuery }),
    asyncHandler(c.history),
  );
  router.post(
    '/:variantId/stock-movements',
    validate({ params: variantParams, body: stockMovementBody }),
    asyncHandler(c.move),
  );
  return router;
};

/** Journal général des mouvements de stock, sous /api/v1/staff/stock-movements (stock:consulter). */
export const createStaffStockJournalRoutes = (
  service: StaffStockService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffStockController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now), requirePermission('stock:consulter'));
  router.get('/', validate({ query: journalQuery }), asyncHandler(c.journal));
  return router;
};
