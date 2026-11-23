import { z } from 'zod';
import { customerId } from './customers.seeder.js';
import { zoneId } from './delivery-zones.seeder.js';
import { accessPlanId } from './access-plans.seeder.js';
import { staffId } from './staff.seeder.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    ownerId: z.string(),
    slug: z.string().min(1),
    name: z.string().min(2),
    description: z.string(),
    city: z.string().min(1),
    district: z.string().min(1),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    phone: z.string().min(1),
    planId: z.string(),
    status: z.enum(['active', 'suspended']),
    verified: z.boolean().optional(),
    verifiedById: z.string().optional(),
    suspensionReason: z.string().optional(),
    suspendedById: z.string().optional(),
    suspendedAt: isoDate.optional(),
    acceptedPaymentMethods: z.array(z.enum(['cash', 'airtel', 'moov'])).min(1),
    handoverModes: z.array(z.enum(['pickup', 'seller_delivery'])).min(1),
    deliveryMode: z.enum(['okoza', 'seller']),
    createdAt: isoDate,
    zoneFees: z.array(z.object({ zoneId: z.string(), fee: z.number().int().min(0) })),
  }),
);

export const loadShops = () => readData('shops.json', schema);
export const shopId = (legacyId: string) => legacyUuid('shop', legacyId);

/** Boutiques vendeuses et frais de livraison des zones utilisées en démonstration. */
export const shopsSeeder: Seeder = {
  name: 'shops',
  demo: true,
  async run({ prisma }) {
    const shops = loadShops();
    const { count } = await prisma.shop.createMany({
      data: shops.map((shop) => ({
        id: shopId(shop.id),
        ownerId: customerId(shop.ownerId),
        slug: shop.slug,
        name: shop.name,
        description: shop.description,
        city: shop.city,
        district: shop.district,
        latitude: shop.latitude ?? null,
        longitude: shop.longitude ?? null,
        phone: shop.phone,
        planId: accessPlanId(shop.planId),
        status: shop.status,
        verifiedAt: shop.verified ? shop.createdAt : null,
        verifiedById: shop.verified ? staffId(shop.verifiedById ?? 'adm1') : null,
        suspensionReason: shop.suspensionReason ?? null,
        suspendedAt: shop.suspendedAt ?? null,
        suspendedById: shop.suspendedById ? staffId(shop.suspendedById) : null,
        acceptedPaymentMethods: shop.acceptedPaymentMethods,
        handoverModes: shop.handoverModes,
        deliveryMode: shop.deliveryMode,
        createdAt: shop.createdAt,
      })),
      skipDuplicates: true,
    });

    await prisma.shopZoneFee.createMany({
      data: shops.flatMap((shop) =>
        shop.zoneFees.map((fee) => ({
          id: legacyUuid('shop-zone-fee', `${shop.id}:${fee.zoneId}`),
          shopId: shopId(shop.id),
          zoneId: zoneId(fee.zoneId),
          fee: fee.fee,
        })),
      ),
      skipDuplicates: true,
    });
    return count;
  },
};
