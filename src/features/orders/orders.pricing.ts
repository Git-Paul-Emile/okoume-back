import { fcfa } from '../../core/text/fcfa.js';

export interface PricedLine {
  productId: string;
  categoryIds: readonly string[];
  unitPrice: number;
  originalPrice: number;
  quantity: number;
}

export interface PromoRule {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minAmount: number;
  freeDelivery: boolean;
  startsAt: Date;
  endsAt: Date;
  maxUses: number | null;
  uses: number;
  active: boolean;
  productIds: readonly string[];
  categoryIds: readonly string[];
}

export interface PricingContext {
  deliveryFee: number;
  promo: PromoRule | null;
  maxDiscountRate: number;
  now: Date;
}

export interface PricedTotals {
  baseSubtotal: number;
  subtotal: number;
  productDiscount: number;
  codeDiscount: number;
  deliveryFee: number;
  deliveryDiscount: number;
  total: number;
  codeError: string | null;
}

export const eligibleLines = (promo: PromoRule, lines: readonly PricedLine[]) =>
  lines.filter(
    (line) =>
      line.unitPrice === line.originalPrice &&
      (!promo.productIds.length || promo.productIds.includes(line.productId)) &&
      (!promo.categoryIds.length || promo.categoryIds.some((categoryId) => line.categoryIds.includes(categoryId))),
  );

export function promoCodeError(promo: PromoRule, lines: readonly PricedLine[], subtotal: number, at: Date) {
  if (!promo.active || at < promo.startsAt || at > promo.endsAt) return 'Ce code n’est plus valide.';
  if (promo.maxUses !== null && promo.uses >= promo.maxUses) return 'Ce code a atteint sa limite d’utilisation.';
  if (subtotal < promo.minAmount) return `Ce code s’applique à partir de ${fcfa(promo.minAmount)} d’achats.`;
  if (!promo.freeDelivery && !eligibleLines(promo, lines).length)
    return 'Aucun article de votre panier n’est éligible à ce code (les articles déjà en promotion sont exclus).';
  return null;
}

export function priceOrder(lines: readonly PricedLine[], ctx: PricingContext): PricedTotals {
  const baseSubtotal = lines.reduce((sum, line) => sum + line.originalPrice * line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const productDiscount = baseSubtotal - subtotal;
  const eligibleTotal = ctx.promo
    ? eligibleLines(ctx.promo, lines).reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
    : 0;
  const codeError = ctx.promo ? promoCodeError(ctx.promo, lines, subtotal, ctx.now) : null;
  const discountCap = Math.max(0, Math.floor(baseSubtotal * ctx.maxDiscountRate) - productDiscount);
  const requestedDiscount = !ctx.promo || codeError
    ? 0
    : ctx.promo.type === 'percent'
      ? Math.round((eligibleTotal * ctx.promo.value) / 100)
      : Math.min(ctx.promo.value, eligibleTotal);
  const codeDiscount = Math.max(0, Math.min(requestedDiscount, discountCap));
  const deliveryDiscount = ctx.promo && !codeError && ctx.promo.freeDelivery ? ctx.deliveryFee : 0;

  return {
    baseSubtotal,
    subtotal,
    productDiscount,
    codeDiscount,
    deliveryFee: ctx.deliveryFee,
    deliveryDiscount,
    total: Math.max(0, subtotal - codeDiscount) + ctx.deliveryFee - deliveryDiscount,
    codeError,
  };
}
