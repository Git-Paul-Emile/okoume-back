import type { SellerTerms, SellerTermsRepository } from '../src/features/orders/orders.sellers.repository.js';
import type { SellerDeliveryRepository } from '../src/features/seller-delivery/seller-delivery.repository.js';
import type { ShopsRepository } from '../src/features/shops/shops.repository.js';

/**
 * Conditions de livraison des boutiques en mémoire (32.5) : la boutique vient du dépôt des boutiques, le mode de
 * livraison et les frais par quartier sont gardés à côté, comme des colonnes que ce dépôt ne lit pas.
 */
export function createMemorySellerTerms(shops: ShopsRepository) {
  const modes = new Map<string, 'okoza' | 'seller'>();
  const fees = new Map<string, Map<string, number>>();
  const repository: SellerTermsRepository = {
    async forZone(shopIds, zoneId) {
      const found = new Map<string, SellerTerms>();
      for (const id of shopIds) {
        const shop = await shops.findById(id);
        if (!shop) continue;
        found.set(id, {
          shopId: id,
          name: shop.name,
          ownerId: shop.ownerId,
          deliveryMode: modes.get(id) ?? 'okoza',
          zoneFee: fees.get(id)?.get(zoneId) ?? null,
        });
      }
      return found;
    },
  };
  const delivery: SellerDeliveryRepository = {
    get: async (shopId) => ({
      mode: modes.get(shopId) ?? 'okoza',
      fees: [...(fees.get(shopId) ?? new Map<string, number>())].map(([zoneId, fee]) => ({ zoneId, fee })),
    }),
    async save(shopId, { mode, fees: list }) {
      modes.set(shopId, mode);
      fees.set(shopId, new Map(list.map((f) => [f.zoneId, f.fee])));
      return delivery.get(shopId);
    },
  };
  return {
    repository,
    delivery,
    /** Le vendeur livre lui-même, à ces frais par quartier */
    sellerDelivers(shopId: string, zoneFees: Record<string, number>) {
      modes.set(shopId, 'seller');
      fees.set(shopId, new Map(Object.entries(zoneFees)));
    },
  };
}
