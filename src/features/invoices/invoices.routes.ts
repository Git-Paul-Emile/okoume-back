import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer, requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createInvoicesController } from './invoices.controller.js';
import { listInvoicesQuery } from './invoices.schemas.js';
import type { InvoicesService } from './invoices.service.js';

/** Factures et avoirs d'une commande du client, sous /api/v1/orders/:id/invoices. */
export const createOrderInvoicesRoutes = (service: InvoicesService, now: () => Date) => {
  const c = createInvoicesController(service);
  const router = Router();
  router.get('/:id/invoices', requireCustomer(now), validate({ params: idParam }), asyncHandler(c.forOrder));
  return router;
};

/** Factures et avoirs côté équipe, sous /api/v1/staff/invoices ; droit paiements:consulter vérifié par le service. */
export const createStaffInvoicesRoutes = (
  service: InvoicesService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createInvoicesController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', validate({ query: listInvoicesQuery }), asyncHandler(c.list));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.get));
  return router;
};
