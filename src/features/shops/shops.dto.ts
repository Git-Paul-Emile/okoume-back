import type { ShopRecord } from './shops.repository.js';

export const toShopDto = (shop: ShopRecord) => ({
  id: shop.id,
  slug: shop.slug,
  name: shop.name,
  description: shop.description,
  city: shop.city,
  district: shop.district,
  position: shop.latitude !== null && shop.longitude !== null
    ? { latitude: shop.latitude, longitude: shop.longitude }
    : null,
  phone: shop.phone,
  acceptedPaymentMethods: shop.acceptedPaymentMethods,
  deliveryMode: shop.deliveryMode,
  status: shop.status,
  suspensionReason: shop.suspensionReason,
  verified: shop.verifiedAt !== null,
  createdAt: shop.createdAt.toISOString(),
});

export const toPublicShopDto = (shop: ShopRecord) => ({
  slug: shop.slug,
  name: shop.name,
  description: shop.description,
  city: shop.city,
  district: shop.district,
  acceptedPaymentMethods: shop.acceptedPaymentMethods,
  verified: shop.verifiedAt !== null,
  createdAt: shop.createdAt.toISOString(),
});
