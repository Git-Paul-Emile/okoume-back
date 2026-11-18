import type { DeliveryZonesRepository } from './delivery-zones.repository.js';

/** Zones proposées au client. Le coût interne d'une course n'est jamais exposé. */
export const createDeliveryZonesService = (repository: DeliveryZonesRepository) => ({
  list: () => repository.findAvailable(),
});

export type DeliveryZonesService = ReturnType<typeof createDeliveryZonesService>;
