import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { createDeliveryZonesController } from './delivery-zones.controller.js';
import type { DeliveryZonesService } from './delivery-zones.service.js';

/** Zones de livraison ouvertes, sous /api/v1/delivery-zones. */
export const createDeliveryZonesRoutes = (service: DeliveryZonesService) => {
  const c = createDeliveryZonesController(service);
  const router = Router();
  router.get('/', asyncHandler(c.list));
  return router;
};
