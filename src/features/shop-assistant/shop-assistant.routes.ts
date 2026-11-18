import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { createAssistantLimiter } from '../../core/middlewares/rateLimiters.js';
import { validate } from '../../core/middlewares/validate.js';
import { createShopAssistantController } from './shop-assistant.controller.js';
import { assistantMessageBody } from './shop-assistant.schemas.js';
import type { ShopAssistantService } from './shop-assistant.service.js';

/** Assistant d'achat public, sous /api/v1/assistant/messages : avec ou sans compte, débit limité par adresse. */
export const createShopAssistantRoutes = (service: ShopAssistantService) => {
  const c = createShopAssistantController(service);
  const router = Router();
  router.post('/messages', createAssistantLimiter(), validate({ body: assistantMessageBody }), asyncHandler(c.answer));
  return router;
};
