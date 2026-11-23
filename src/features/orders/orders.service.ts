import { AppError, ConflictError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { randomReadableCode, safeEqual } from '../../core/security/secrets.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import type { Notifier } from '../notifications/notifier.js';
import { newOrderMessage, sellerOrderMessage } from '../notifications/notifications.rules.js';
import { phoneKey } from '../../core/text/phoneKey.js';
import { suspicionReasons } from './orders.risk.js';
import { logger } from '../../lib/logger.js';
import { ancestry, type CategoriesService } from '../categories/categories.service.js';
import type { DeliveryZoneRecord, DeliveryZonesRepository } from '../delivery-zones/delivery-zones.repository.js';
import type { PromoCodesRepository } from '../promo-codes/promo-codes.repository.js';
import { salePrice } from '../products/products.pricing.js';
import type { ProductsRepository } from '../products/products.repository.js';
import { toOrderDto, toTrackingDto } from './orders.dto.js';
import { checkoutConfirmationEmail } from './orders.emails.js';
import type { NewOrder, OrderRecord, OrdersRepository } from './orders.repository.js';
import type { CreateOrderInput, ListOrdersQuery, QuoteInput } from './orders.schemas.js';
import { priceOrder, type PricedTotals } from './orders.pricing.js';
import type { SellerTerms, SellerTermsRepository } from './orders.sellers.repository.js';
import { cancelPlan } from './orders.transitions.js';

/** Fenêtre opérationnelle (cahier des charges, 19.5) : 3 ans de commandes visibles dans le compte. */
export const ACCOUNT_HISTORY_MS = 3 * 365 * 24 * 60 * 60_000;
const NUMBER_ATTEMPTS = 3;

/** Numéro lisible, sans séquence qui révèle le volume des ventes : CMD-2026-7KQ4XM. */
export const orderNumber = (at: Date) => `CMD-${at.getUTCFullYear()}-${randomReadableCode(6)}`;

/** Stock insuffisant au moment de confirmer : rien n'a été réservé ni créé. */
export class OutOfStockError extends AppError {
  constructor(details: ReadonlyArray<{ field: string; message: string }>) {
    super('Stock insuffisant pour certains articles.', 409, 'OUT_OF_STOCK', details);
  }
}

export interface OrdersDependencies {
  orders: OrdersRepository;
  products: ProductsRepository;
  zones: DeliveryZonesRepository;
  categories: CategoriesService;
  promoCodes: PromoCodesRepository;
  /** Conditions de livraison des boutiques de vendeurs (32.5) */
  sellers: SellerTermsRepository;
  email: EmailSender;
  notifier: Notifier;
  /** Adresse e-mail d'un compte client : rattachement d'une commande passée sans compte */
  accounts: { emailOf(customerId: string): Promise<string | null> };
  appUrl: string;
  now: () => Date;
}

export const createOrdersService = ({
  orders,
  products,
  zones,
  categories,
  promoCodes,
  sellers,
  email,
  notifier,
  accounts,
  appUrl,
  now,
}: OrdersDependencies) => {
  /** Une même clé ne sert qu'à son auteur : un tiers qui la rejoue ne voit pas la commande. */
  function replay(existing: OrderRecord, customerId: string | null) {
    if (existing.customerId !== customerId) throw new ConflictError('Cette commande a déjà été envoyée.');
    return { order: toOrderDto(existing), created: false };
  }

  async function priceLines(input: Pick<CreateOrderInput, 'lines'>, at: Date) {
    // Deux lignes sur la même variante sont regroupées
    const quantities = new Map<string, number>();
    for (const line of input.lines)
      quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
    const variants = new Map(
      (await products.findSellableVariants([...quantities.keys()], at)).map((v) => [v.variantId, v] as const),
    );

    const unavailable = [...quantities.keys()].filter((id) => !variants.get(id)?.published);
    if (unavailable.length)
      throw new UnprocessableError('Certains articles ne sont plus en vente : retirez-les du panier.');

    const index = await categories.index();
    return [...quantities].map(([variantId, quantity]) => {
      const v = variants.get(variantId)!;
      return {
        categoryIds: ancestry(v.categoryId, index),
        productId: v.productId,
        variantId,
        name: v.productName,
        variantLabel: v.label,
        image: v.image,
        unitPrice: salePrice(v.price, v.promotion, at),
        originalPrice: v.price,
        vatRate: v.vatRate,
        shopId: v.shopId,
        quantity,
      };
    });
  }

  async function availableZone(zoneId: string) {
    const zone = await zones.findById(zoneId);
    if (!zone?.available) throw new UnprocessableError('Cette zone n’est plus desservie : choisissez-en une autre.');
    return zone;
  }

  type Line = Awaited<ReturnType<typeof priceLines>>[number];

  /** Panier réparti par boutique (32.4) : la boutique Okoumé d'abord, puis chaque vendeur. */
  function byShop(items: Line[]) {
    const groups = new Map<string | null, Line[]>();
    for (const item of items) groups.set(item.shopId, [...(groups.get(item.shopId) ?? []), item]);
    return [...groups].sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : 0));
  }

  /**
   * Qui livre chaque commande et à quel prix (32.5) : les livreurs Okoumé aux frais du quartier, ou le vendeur à
   * ses propres frais. Un vendeur qui ne livre pas ce quartier bloque la commande, avec un message clair.
   */
  async function deliveryFor(shopIds: string[], zone: DeliveryZoneRecord | null) {
    const terms = zone ? await sellers.forZone(shopIds, zone.id) : new Map<string, SellerTerms>();
    return (shopId: string | null) => {
      if (!shopId || !zone) return { fulfilledBy: 'okoume' as const, fee: zone?.fee ?? 0, terms: null };
      const shop = terms.get(shopId);
      if (!shop) throw new UnprocessableError('Une boutique de votre panier n’est plus disponible.');
      if (shop.deliveryMode === 'okoume') return { fulfilledBy: 'okoume' as const, fee: zone.fee, terms: shop };
      if (shop.zoneFee === null)
        throw new UnprocessableError(
          `La boutique ${shop.name} ne livre pas à ${zone.name} : retirez ses articles ou choisissez un autre quartier.`,
        );
      return { fulfilledBy: 'seller' as const, fee: shop.zoneFee, terms: shop };
    };
  }

  /**
   * Devis du panier : prix de la base, promotion en vigueur, code et frais de livraison.
   * Une commande par boutique (32.4), chacune avec ses frais ; le code promo ne porte que sur les
   * produits de la boutique Okoumé. Sans zone (panier, avant le choix du quartier), la livraison n'est pas comptée.
   * Un code inconnu est signalé comme une erreur de code, sans révéler l'existence d'autres codes.
   */
  async function quoteFor(
    input: Omit<QuoteInput, 'zoneId'>,
    zone: DeliveryZoneRecord | null,
    at: Date,
  ) {
    const items = await priceLines(input, at);
    const groups = byShop(items);
    const hasOkoume = groups.some(([shopId]) => shopId === null);
    const promo = input.promoCode && hasOkoume ? await promoCodes.findByCode(input.promoCode) : null;
    const delivery = await deliveryFor(
        groups.flatMap(([shopId]) => (shopId ? [shopId] : [])),
        zone,
      );
    const shipments = groups.map(([shopId, lines]) => {
      const { fee, fulfilledBy, terms } = delivery(shopId);
      const okoume = shopId === null;
      const priced = priceOrder(lines, {
        deliveryFee: fee,
        promo: okoume ? promo : null,
        pointsRequested: 0,
        customer: null,
        maxDiscountRate: 1,
        now: at,
      });
      return { shopId, shopName: terms?.name ?? null, ownerId: terms?.ownerId ?? null, fulfilledBy, lines, priced };
    });
    const main = shipments.find((s) => s.shopId === null)?.priced;
    const codeError = !input.promoCode
      ? null
      : !hasOkoume
        ? 'Ce code s’applique aux produits vendus par Okoumé.'
        : !promo
          ? 'Ce code n’existe pas.'
          : (main?.codeError ?? null);
    const pointsError: string | null = null;
    const sum = (key: Exclude<keyof PricedTotals, 'codeError' | 'pointsError'>) =>
      shipments.reduce((total, s) => total + s.priced[key], 0);
    const totals = {
      baseSubtotal: sum('baseSubtotal'),
      subtotal: sum('subtotal'),
      productDiscount: sum('productDiscount'),
      codeDiscount: sum('codeDiscount'),
      pointsUsed: sum('pointsUsed'),
      pointsDiscount: sum('pointsDiscount'),
      deliveryFee: sum('deliveryFee'),
      deliveryDiscount: sum('deliveryDiscount'),
      total: sum('total'),
      pointsEarned: sum('pointsEarned'),
      codeError,
      pointsError,
    };
    return { shipments, promo: codeError ? null : promo, totals };
  }

  async function notify(order: OrderRecord, ownerId: string | null) {
    // Chaque boutique reçoit ses commandes (32.4) : l'équipe Okoumé pour les siennes, le vendeur pour les autres
    if (ownerId) await notifier.notifyCustomer(ownerId, 'orders', sellerOrderMessage(order, appUrl));
    else await notifier.notifyStaff('commandes:consulter', newOrderMessage(order, appUrl), true);
  }

  /** Commandes d'un même passage en caisse, ou la commande seule. */
  async function checkoutOf(order: OrderRecord) {
    return order.checkoutNumber ? orders.findByCheckout(order.checkoutNumber) : [order];
  }

  return {
    /**
     * Passage de commande : une commande par boutique du panier (32.4), toutes créées ensemble ou aucune.
     * Idempotent : la même clé renvoie les mêmes commandes, jamais un doublon. Prix, promotion en vigueur et
     * frais de livraison sont ceux de la base.
     */
    async place(input: CreateOrderInput, customerId: string | null) {
      const existing = await orders.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        const replayed = replay(existing, customerId);
        return { ...replayed, orders: (await checkoutOf(existing)).map(toOrderDto) };
      }

      const at = now();
      const zone = await availableZone(input.delivery.zoneId);
      const { shipments, promo, totals } = await quoteFor(
        { lines: input.lines, promoCode: input.promoCode },
        zone,
        at,
      );
      // La commande ne passe qu'au prix annoncé : un code refusé bloque la commande.
      if (totals.codeError) throw new AppError(totals.codeError, 422, 'PROMO_CODE_REJECTED');
      // Signaux anti-fraude (19.3) : la commande passe, mais attend une vérification avant la préparation
      const key = phoneKey(input.delivery.phone);
      const [history, reviewAmount] = await Promise.all([
        orders.riskHistory(key, input.delivery.email, at),
        orders.reviewThreshold(),
      ]);
      const checkoutNumber = shipments.length > 1 ? `PAN-${at.getUTCFullYear()}-${randomReadableCode(6)}` : null;
      const trackingCode = randomReadableCode(6);
      const drafts = shipments.map(({ shopId, fulfilledBy, lines, priced }, index): Omit<NewOrder, 'number'> => {
        const reviewReasons = suspicionReasons(
          {
            total: priced.total,
            subtotal: priced.subtotal,
            discounts: priced.codeDiscount + priced.pointsDiscount,
            quantities: lines.map((l) => l.quantity),
          },
          history,
          reviewAmount,
        );
        return {
          phoneKey: key,
          reviewReasons,
          reviewStatus: reviewReasons.length ? 'pending' : null,
          trackingCode,
          customerId,
          // La première commande garde la clé envoyée : un renvoi retrouve tout le passage en caisse
          idempotencyKey: index === 0 ? input.idempotencyKey : `${input.idempotencyKey}:${index + 1}`,
          ...input.delivery,
          instructions: input.delivery.instructions ?? '',
          zoneName: zone.name,
          totals: {
            subtotal: priced.subtotal,
            productDiscount: priced.productDiscount,
            codeDiscount: priced.codeDiscount,
            pointsDiscount: priced.pointsDiscount,
            deliveryFee: priced.deliveryFee,
            deliveryDiscount: priced.deliveryDiscount,
            total: priced.total,
          },
          promoCode: shopId === null ? (promo?.code ?? null) : null,
          promoCodeId: shopId === null ? (promo?.id ?? null) : null,
          pointsUsed: priced.pointsUsed,
          paymentMethod: input.paymentMethod,
          // Paiement à la réception, quel que soit le moyen (cahier des charges, 8.4 à 8.6)
          paymentStatus: 'awaiting_payment',
          shopId,
          checkoutNumber,
          fulfilledBy,
          items: lines.map(({ categoryIds: _c, shopId: _s, ...item }) => item),
        };
      });

      for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt++) {
        const result = await orders.createCheckout(drafts.map((d) => ({ ...d, number: orderNumber(at) })));
        if (result.outcome === 'created') {
          try {
            await email.send(checkoutConfirmationEmail(result.orders, appUrl));
          } catch (err) {
            logger.error({ err, checkoutNumber, orderId: result.orders[0]?.id }, 'E-mail de confirmation non déposé');
          }
          for (const [i, order] of result.orders.entries()) await notify(order, shipments[i]?.ownerId ?? null);
          return { order: toOrderDto(result.orders[0]!), orders: result.orders.map(toOrderDto), created: true };
        }
        if (result.outcome === 'out_of_stock') {
          const byId = new Map(shipments.flatMap((s) => s.lines).map((i) => [i.variantId, i] as const));
          throw new OutOfStockError(
            result.shortages.map(({ variantId, available }) => {
              const item = byId.get(variantId);
              return {
                field: `lines.${variantId}`,
                message: `${item?.name ?? 'Article'} (${item?.variantLabel ?? ''}) : ${available} disponible${available > 1 ? 's' : ''}, ${item?.quantity ?? 0} demandé${(item?.quantity ?? 0) > 1 ? 's' : ''}.`,
              };
            }),
          );
        }
        if (result.outcome === 'promo_unavailable')
          throw new AppError('Ce code vient d’atteindre sa limite d’utilisation.', 409, 'PROMO_CODE_REJECTED');
        if (result.outcome === 'duplicate_request') {
          // Même clé envoyée deux fois au même instant : la première a gagné
          const winner = await orders.findByIdempotencyKey(input.idempotencyKey);
          if (winner) return { ...replay(winner, customerId), orders: (await checkoutOf(winner)).map(toOrderDto) };
        }
        // Numéro déjà pris (tirage au hasard) : nouvel essai avec d'autres numéros
      }
      throw new Error('Impossible d’attribuer un numéro de commande unique.');
    },

    /**
     * Devis du panier avant commande : totaux du panier, et détail par boutique (qui vend, qui livre, frais).
     */
      async quote(input: QuoteInput, _customerId: string | null) {
      const zone = input.zoneId ? await availableZone(input.zoneId) : null;
        const { shipments, totals } = await quoteFor(input, zone, now());
      return {
        zone: zone && { id: zone.id, name: zone.name },
        totals,
        shipments: shipments.map((s) => ({
          shop: s.shopId ? { id: s.shopId, name: s.shopName } : null,
          fulfilledBy: s.fulfilledBy,
          subtotal: s.priced.subtotal,
          deliveryFee: s.priced.deliveryFee,
          total: s.priced.total,
          items: s.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        })),
      };
    },

    async listForCustomer(customerId: string, query: ListOrdersQuery) {
      const since = new Date(now().getTime() - ACCOUNT_HISTORY_MS);
      const { items, total } = await orders.listForCustomer(customerId, since, query, query.number);
      return paginate(items.map(toOrderDto), total, query.page, query.limit);
    },

    /** Une commande d'un autre client répond 404, comme une commande inexistante (protection IDOR). */
    async getForCustomer(customerId: string, orderId: string) {
      return toOrderDto(await ownOrder(customerId, orderId));
    },

    /**
     * Annulation par le client (6.5). Tant que la commande est confirmée, elle est annulée tout de suite
     * et la réservation libérée. Une fois la préparation commencée, c'est une demande que l'équipe tranche.
     */
    async cancelOwn(customerId: string, orderId: string, request: { reason: string; comment: string }) {
      const order = await ownOrder(customerId, orderId);
      if (order.status === 'confirmed') {
        const plan = cancelPlan(order, `Annulée par le client : ${request.reason}`);
        const result = await orders.applyTransition(order, plan, { type: 'customer' });
        if (result.outcome === 'stale')
          throw new ConflictError('La commande a changé entre-temps : rechargez la page.');
        return { order: toOrderDto(result.order), direct: true };
      }
      if (!CANCELLABLE_ON_REQUEST.includes(order.status))
        throw new ConflictError('Cette commande ne peut plus être annulée.');
      if (!(await orders.requestCancellation(order.id, request)))
        throw new ConflictError('Une demande d’annulation existe déjà pour cette commande.');
      return { order: toOrderDto((await orders.findById(order.id)) ?? order), direct: false };
    },

    /**
     * Contestation d'une livraison marquée « Livrée » (9.6) : la réclamation est ouverte sans effacer ce statut ;
     * l'enquête et sa résolution sont suivies à part.
     */
    async disputeDelivery(customerId: string, orderId: string, reason: string) {
      const order = await ownOrder(customerId, orderId);
      if (order.fulfilledBy === 'seller')
        throw new UnprocessableError(
          'La plateforme ne traite pas les différends concernant une livraison organisée par le vendeur. Contactez directement la boutique.',
        );
      if (order.status !== 'delivered')
        throw new ConflictError('Seule une commande marquée livrée peut être contestée.');
      if (!(await orders.openDispute(order.id, reason)))
        throw new ConflictError('Une contestation est déjà ouverte pour cette commande.');
      return toOrderDto((await orders.findById(order.id)) ?? order);
    },

    /**
     * Rattachement au compte d'une commande passée sans compte : numéro et code de suivi, et même adresse e-mail
     * que le compte. Le code seul ne suffit pas : le compte verrait ensuite les coordonnées du destinataire.
     */
    async claim(customerId: string, number: string, code: string) {
      const lookup = number.trim().toUpperCase();
      const order = await orders.findByNumber(lookup);
      const route = order ? await checkoutOf(order) : await orders.findByCheckout(lookup);
      const unknown = new NotFoundError('Aucune commande ne correspond à ce numéro et ce code.');
      if (!route.length || !route.some((stop) => safeEqual(stop.trackingCode, code.trim().toUpperCase()))) throw unknown;
      if (route.every((stop) => stop.customerId === customerId))
        throw new ConflictError('Cette commande est déjà dans votre compte.');
      if (route.some((stop) => stop.customerId)) throw unknown;
      const first = route[0]!;
      const accountEmail = await accounts.emailOf(customerId);
      if (!accountEmail || accountEmail.toLowerCase() !== first.email.toLowerCase())
        throw new UnprocessableError(
          'Cette commande a été passée avec une autre adresse e-mail que celle de votre compte.',
        );
      if (!(await orders.claimCheckout(route, customerId))) throw unknown;
      return toOrderDto((await orders.findById(first.id)) ?? first);
    },

    /**
     * Suivi sans compte : numéro et code de suivi reçus par e-mail. Une réponse unique pour « inconnu » et
     * « mauvais code » ; aucune coordonnée du client dans la réponse.
     */
    async track(number: string, code: string) {
      const lookup = number.trim().toUpperCase();
      const order = await orders.findByNumber(lookup);
      const route = order
        ? await checkoutOf(order)
        : await orders.findByCheckout(lookup);
      if (!route.length || !route.some((stop) => safeEqual(stop.trackingCode, code.trim().toUpperCase())))
        throw new NotFoundError('Aucune commande ne correspond à ce numéro et ce code.');
      return toTrackingDto(route);
    },
  };

  async function ownOrder(customerId: string, orderId: string) {
    const order = await orders.findForCustomer(orderId, customerId);
    if (!order || order.createdAt.getTime() < now().getTime() - ACCOUNT_HISTORY_MS)
      throw new NotFoundError('Commande introuvable.');
    return order;
  }
};

/** Après le début de la préparation et avant la livraison, l'annulation passe par une demande. */
const CANCELLABLE_ON_REQUEST: readonly OrderRecord['status'][] = ['preparing', 'ready', 'courier_assigned', 'shipping'];

export type OrdersService = ReturnType<typeof createOrdersService>;
