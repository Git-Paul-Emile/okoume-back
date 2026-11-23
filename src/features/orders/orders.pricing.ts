import { fcfa } from '../../core/text/fcfa.js';

/** Règles fixées par le cahier des charges (12.1, 12.2). */
export const POINT_VALUE = 50;
export const MIN_REDEEM = 100;
export const EARN_PER = 1_000;

export type Tier = 'bronze' | 'argent' | 'or';

export interface PricedLine {
  productId: string;
  /** Catégorie du produit et toutes ses catégories parentes */
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
  newCustomersOnly: boolean;
  tiers: readonly Tier[];
  startsAt: Date;
  endsAt: Date;
  maxUses: number | null;
  perCustomer: number | null;
  uses: number;
  active: boolean;
  customerId: string | null;
  productIds: readonly string[];
  categoryIds: readonly string[];
}

export interface PricingContext {
  deliveryFee: number;
  promo: PromoRule | null;
  pointsRequested: number;
  /** Client connecté ; null pour une commande sans compte */
  customer: { id: string; isNew: boolean; tier: Tier; codeUses: number; pointsBalance: number } | null;
  maxDiscountRate: number;
  now: Date;
}

export interface PricedTotals {
  baseSubtotal: number;
  subtotal: number;
  productDiscount: number;
  codeDiscount: number;
  pointsUsed: number;
  pointsDiscount: number;
  deliveryFee: number;
  deliveryDiscount: number;
  total: number;
  /** Points gagnés à la livraison payée : 1 par tranche de 1 000 FCFA de produits après réductions (12.1) */
  pointsEarned: number;
  codeError: string | null;
  pointsError: string | null;
}

/** Articles éligibles au code : hors promotion produit (pas de cumul, 28.5) et dans son périmètre. */
export const eligibleLines = (promo: PromoRule, lines: readonly PricedLine[]) =>
  lines.filter(
    (l) =>
      l.unitPrice === l.originalPrice &&
      (!promo.productIds.length || promo.productIds.includes(l.productId)) &&
      (!promo.categoryIds.length || promo.categoryIds.some((c) => l.categoryIds.includes(c))),
  );

/** Raison pour laquelle le code ne s'applique pas à ce panier, ou null (11.2). */
export function promoCodeError(promo: PromoRule, lines: readonly PricedLine[], subtotal: number, ctx: PricingContext) {
  if (!promo.active || ctx.now < promo.startsAt || ctx.now > promo.endsAt) return 'Ce code n’est plus valide.';
  if (promo.maxUses !== null && promo.uses >= promo.maxUses) return 'Ce code a atteint sa limite d’utilisation.';
  if (subtotal < promo.minAmount) return `Ce code s’applique à partir de ${fcfa(promo.minAmount)} d’achats.`;
  if (!promo.freeDelivery && !eligibleLines(promo, lines).length)
    return 'Aucun article de votre panier n’est éligible à ce code (les articles déjà en promotion sont exclus).';
  return null;
}

/**
 * Totaux d'une commande (11, 12.2) : promotion produit, puis code, puis points. Le cumul des réductions est
 * plafonné à une part du sous-total avant réductions ; les points ne paient jamais la livraison.
 * Même calcul que le panier du front (front/src/features/cart/cart.utils.ts), sauf les points gagnés,
 * comptés hors livraison comme le demande le cahier des charges.
 */
export function priceOrder(lines: readonly PricedLine[], ctx: PricingContext): PricedTotals {
  const baseSubtotal = lines.reduce((s, l) => s + l.originalPrice * l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const productDiscount = baseSubtotal - subtotal;
  const cap = Math.floor(baseSubtotal * ctx.maxDiscountRate);

  let codeDiscount = 0;
  let deliveryDiscount = 0;
  const codeError = ctx.promo ? promoCodeError(ctx.promo, lines, subtotal, ctx) : null;
  if (ctx.promo && !codeError) {
    const eligible = eligibleLines(ctx.promo, lines).reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    codeDiscount =
      ctx.promo.type === 'percent'
        ? Math.round((eligible * ctx.promo.value) / 100)
        : Math.min(ctx.promo.value, eligible);
    if (ctx.promo.freeDelivery) deliveryDiscount = ctx.deliveryFee;
  }
  codeDiscount = Math.max(0, Math.min(codeDiscount, cap - productDiscount));

  // Le programme de fidélité est retiré du MVP : aucun point n'est consommé ni gagné.
  const pointsUsed = 0;
  const pointsDiscount = 0;
  const pointsError: string | null = null;
  const productsTotal = Math.max(0, subtotal - codeDiscount);

  return {
    baseSubtotal,
    subtotal,
    productDiscount,
    codeDiscount,
    pointsUsed,
    pointsDiscount,
    deliveryFee: ctx.deliveryFee,
    deliveryDiscount,
    total: productsTotal + ctx.deliveryFee - deliveryDiscount,
    pointsEarned: 0,
    codeError,
    pointsError,
  };
}

/** Niveau selon les achats livrés et payés, nets des remboursements (12.4). */
export const tierFor = (spend: number, thresholds: { silver: number; gold: number }): Tier =>
  spend >= thresholds.gold ? 'or' : spend >= thresholds.silver ? 'argent' : 'bronze';
