import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import {
  optionalCustomer,
  requireCustomer,
  requireStaff,
  type StaffAuthenticator,
} from '../../core/middlewares/authenticate.js';
import { createAuthLimiter } from '../../core/middlewares/rateLimiters.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createSupportController } from './support.controller.js';
import {
  createTicketBody,
  listMyTicketsQuery,
  listStaffTicketsQuery,
  messageBody,
  reopenBody,
  satisfactionBody,
  ticketNumberParam,
  updateTicketBody,
} from './support.schemas.js';
import type { SupportService } from './support.service.js';

/**
 * Assistance côté client, sous /api/v1/support. Une demande peut venir du formulaire de contact, sans compte
 * (limite stricte contre les envois en masse) ; le suivi et les réponses demandent un compte.
 */
export const createSupportRoutes = (service: SupportService, now: () => Date) => {
  const c = createSupportController(service);
  const customerOnly = requireCustomer(now);
  const router = Router();
  router.post('/attachment-uploads', customerOnly, asyncHandler(c.signAttachmentUpload));
  router.post(
    '/tickets',
    createAuthLimiter(),
    optionalCustomer(now),
    validate({ body: createTicketBody }),
    asyncHandler(c.create),
  );
  router.get('/tickets', customerOnly, validate({ query: listMyTicketsQuery }), asyncHandler(c.mine));
  router.get('/tickets/:number', customerOnly, validate({ params: ticketNumberParam }), asyncHandler(c.get));
  router.post(
    '/tickets/:number/messages',
    customerOnly,
    validate({ params: ticketNumberParam, body: messageBody }),
    asyncHandler(c.reply),
  );
  router.post(
    '/tickets/:number/reopenings',
    customerOnly,
    validate({ params: ticketNumberParam, body: reopenBody }),
    asyncHandler(c.reopen),
  );
  router.put(
    '/tickets/:number/satisfaction',
    customerOnly,
    validate({ params: ticketNumberParam, body: satisfactionBody }),
    asyncHandler(c.rate),
  );
  return router;
};

const answerBody = z.strictObject({ body: messageBody.shape.body });

/** Assistance côté équipe, sous /api/v1/staff/support/tickets : file des demandes, réponses, suivi. */
export const createStaffSupportRoutes = (
  service: SupportService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createSupportController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', validate({ query: listStaffTicketsQuery }), asyncHandler(c.list));
  router.get('/:id', validate({ params: idParam }), asyncHandler(c.staffGet));
  router.post('/:id/messages', validate({ params: idParam, body: answerBody }), asyncHandler(c.answer));
  router.patch('/:id', validate({ params: idParam, body: updateTicketBody }), asyncHandler(c.update));
  return router;
};
