/**
 * Calcul des prix de vente, seule référence côté serveur : le prix envoyé par le navigateur n'est
 * jamais cru. Mêmes règles que le front (front/src/features/products/products.utils.ts).
 */
export interface PromotionRule {
  type: 'percent' | 'fixed';
  value: number;
  startsAt: Date;
  endsAt: Date;
}

export const isPromotionActive = (promotion: PromotionRule | null, now: Date): promotion is PromotionRule =>
  !!promotion && promotion.startsAt <= now && now <= promotion.endsAt;

/** Prix après promotion, arrondi au franc, jamais négatif. */
export function salePrice(price: number, promotion: PromotionRule | null, now: Date) {
  if (!isPromotionActive(promotion, now)) return price;
  const reduced = promotion.type === 'percent' ? price * (1 - promotion.value / 100) : price - promotion.value;
  return Math.max(0, Math.round(reduced));
}
