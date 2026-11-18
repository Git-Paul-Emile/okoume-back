import type { AccessPlanRecord, ShopPaymentRecord, ShopRecord } from './shops.repository.js';
import { accessState, addDays, isVisible } from './shops.rules.js';

export const toPlanDto = (plan: AccessPlanRecord) => plan;

/** Accès de la boutique tel que le vendeur et l'administration le voient. */
export function accessOf(shop: ShopRecord, now: Date, graceDays: number) {
  const state = accessState(
    { status: shop.status, planKind: shop.plan.kind, accessEndsAt: shop.accessEndsAt, inTrial: shop.inTrial },
    now,
    graceDays,
  );
  return {
    state,
    visible: isVisible(state),
    endsAt: shop.accessEndsAt?.toISOString() ?? null,
    graceEndsAt: shop.accessEndsAt ? addDays(shop.accessEndsAt, graceDays).toISOString() : null,
  };
}

/** Fiche complète, pour le vendeur lui-même et pour l'administration. */
export const toShopDto = (shop: ShopRecord, now: Date, graceDays: number) => ({
  id: shop.id,
  slug: shop.slug,
  name: shop.name,
  description: shop.description,
  city: shop.city,
  district: shop.district,
  position:
    shop.latitude !== null && shop.longitude !== null ? { latitude: shop.latitude, longitude: shop.longitude } : null,
  phone: shop.phone,
  acceptedPaymentMethods: shop.acceptedPaymentMethods,
  handoverModes: shop.handoverModes,
  plan: toPlanDto(shop.plan),
  access: accessOf(shop, now, graceDays),
  status: shop.status,
  suspensionReason: shop.suspensionReason,
  verified: shop.verifiedAt !== null,
  createdAt: shop.createdAt.toISOString(),
});

/**
 * Fiche publique : ni téléphone ni position. Le vendeur se joint par le tchat (32.5) et sa distance s'affiche
 * arrondie (32.4), jamais son adresse exacte.
 */
export const toPublicShopDto = (shop: ShopRecord) => ({
  slug: shop.slug,
  name: shop.name,
  description: shop.description,
  city: shop.city,
  district: shop.district,
  acceptedPaymentMethods: shop.acceptedPaymentMethods,
  handoverModes: shop.handoverModes,
  verified: shop.verifiedAt !== null,
  createdAt: shop.createdAt.toISOString(),
});

export const toPaymentDto = (payment: ShopPaymentRecord) => ({
  id: payment.id,
  shop: { id: payment.shop.id, name: payment.shop.name },
  plan: payment.plan,
  amount: payment.amount,
  method: payment.method,
  reference: payment.reference,
  status: payment.status,
  decisionReason: payment.decisionReason,
  decidedAt: payment.decidedAt?.toISOString() ?? null,
  periodStart: payment.periodStart?.toISOString() ?? null,
  periodEnd: payment.periodEnd?.toISOString() ?? null,
  createdAt: payment.createdAt.toISOString(),
});
