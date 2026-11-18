import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireCustomer } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createChatController } from './chat.controller.js';
import {
  buyerConversationAction,
  listConversationsQuery,
  messageBody,
  messagesQuery,
  openConversationBody,
  sellerAgreementBody,
} from './chat.schemas.js';
import type { ChatService } from './chat.service.js';

/**
 * Tchat de l'acheteur connecté, sous /api/v1/conversations (32.5, 32.6). Les nouveaux messages se suivent avec
 * GET /conversations/:id?since=<date du dernier message reçu>.
 */
export const createBuyerChatRoutes = (service: ChatService, now: () => Date) => {
  const c = createChatController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.post('/', validate({ body: openConversationBody }), asyncHandler(c.open));
  router.get('/', validate({ query: listConversationsQuery }), asyncHandler(c.list));
  router.get('/:id', validate({ params: idParam, query: messagesQuery }), asyncHandler(c.get));
  router.post('/:id/messages', validate({ params: idParam, body: messageBody }), asyncHandler(c.send));
  router.patch('/:id', validate({ params: idParam, body: buyerConversationAction }), asyncHandler(c.close));
  return router;
};

/** Conversations de la boutique du vendeur connecté, sous /api/v1/seller/conversations. */
export const createSellerChatRoutes = (service: ChatService, now: () => Date) => {
  const c = createChatController(service);
  const router = Router();
  router.use(requireCustomer(now));
  router.get('/', validate({ query: listConversationsQuery }), asyncHandler(c.sellerList));
  router.get('/:id', validate({ params: idParam, query: messagesQuery }), asyncHandler(c.sellerGet));
  router.post('/:id/messages', validate({ params: idParam, body: messageBody }), asyncHandler(c.sellerSend));
  router.put(
    '/:id/agreement',
    validate({ params: idParam, body: sellerAgreementBody }),
    asyncHandler(c.sellerAgreement),
  );
  return router;
};
