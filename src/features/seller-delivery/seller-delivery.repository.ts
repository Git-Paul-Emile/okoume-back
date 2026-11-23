import { prisma } from '../../lib/prisma.js';

/** Mode de livraison d'une boutique et frais par quartier quand le vendeur livre lui-même (32.5). */
export interface ShopDeliveryRecord {
  mode: 'okoza' | 'seller';
  fees: Array<{ zoneId: string; fee: number }>;
}

export interface SellerDeliveryRepository {
  get(shopId: string): Promise<ShopDeliveryRecord>;
  /** Mode et frais remplacés ensemble : jamais un mode sans les frais qui vont avec. */
  save(shopId: string, delivery: ShopDeliveryRecord): Promise<ShopDeliveryRecord>;
}

export const sellerDeliveryRepository: SellerDeliveryRepository = {
  async get(shopId) {
    const shop = await prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: {
        deliveryMode: true,
        zoneFees: { where: { available: true }, select: { zoneId: true, fee: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    return { mode: shop.deliveryMode, fees: shop.zoneFees.map((f) => ({ zoneId: f.zoneId, fee: f.fee.toNumber() })) };
  },

  async save(shopId, { mode, fees }) {
    await prisma.$transaction([
      prisma.shop.update({ where: { id: shopId }, data: { deliveryMode: mode }, select: { id: true } }),
      prisma.shopZoneFee.deleteMany({ where: { shopId } }),
      prisma.shopZoneFee.createMany({ data: fees.map((f) => ({ shopId, zoneId: f.zoneId, fee: f.fee })) }),
    ]);
    return sellerDeliveryRepository.get(shopId);
  },
};
