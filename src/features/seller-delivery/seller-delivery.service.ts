import { ForbiddenError, UnprocessableError } from '../../core/errors/AppError.js';
import type { DeliveryZonesRepository } from '../delivery-zones/delivery-zones.repository.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import type { SellerDeliveryRepository } from './seller-delivery.repository.js';
import type { SellerDeliveryInput } from './seller-delivery.schemas.js';

export interface SellerDeliveryDeps {
  delivery: SellerDeliveryRepository;
  shops: ShopsRepository;
  zones: DeliveryZonesRepository;
}

/**
 * Livraison des commandes d'une boutique (cahier des charges 1.2, 32.5) : par les livreurs OKOZA, aux frais
 * de chaque quartier, ou par le vendeur, à ses propres frais. Les quartiers sont communs à toute la plateforme.
 */
export const createSellerDeliveryService = ({ delivery, shops, zones }: SellerDeliveryDeps) => {
  async function myShop(customerId: string) {
    const shop = await shops.findByOwner(customerId);
    if (!shop) throw new ForbiddenError('Ouvrez d’abord votre boutique pour vendre sur OKOZA.');
    return shop;
  }

  return {
    async get(customerId: string) {
      return delivery.get((await myShop(customerId)).id);
    },

    async save(customerId: string, input: SellerDeliveryInput) {
      const shop = await myShop(customerId);
      if (shop.status === 'suspended') throw new ForbiddenError('Votre boutique est suspendue.');
      if (input.mode === 'seller' && !input.fees.length)
        throw new UnprocessableError('Indiquez au moins un quartier que vous livrez, avec ses frais.');
      const known = new Set((await zones.findAvailable()).map((z) => z.id));
      if (input.fees.some((f) => !known.has(f.zoneId)))
        throw new UnprocessableError('Un des quartiers choisis n’est plus desservi : rechargez la liste.');
      // Avec les livreurs OKOZA, les frais du vendeur ne servent pas : ils sont retirés
      return delivery.save(shop.id, { mode: input.mode, fees: input.mode === 'seller' ? input.fees : [] });
    },
  };
};

export type SellerDeliveryService = ReturnType<typeof createSellerDeliveryService>;
