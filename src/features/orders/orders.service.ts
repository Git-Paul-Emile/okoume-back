import { AppError, ConflictError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { randomReadableCode, safeEqual } from '../../core/security/secrets.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import type { Notifier } from '../notifications/notifier.js';
import { newOrderMessage } from '../notifications/notifications.rules.js';
import { phoneKey } from '../../core/text/phoneKey.js';
import { suspicionReasons } from './orders.risk.js';
import { logger } from '../../lib/logger.js';
import { ancestry, type CategoriesService } from '../categories/categories.service.js';
import type { DeliveryZoneRecord, DeliveryZonesRepository } from '../delivery-zones/delivery-zones.repository.js';
import type { LoyaltyRepository } from '../loyalty/loyalty.repository.js';
import type { PromoCodesRepository } from '../promo-codes/promo-codes.repository.js';
import { salePrice } from '../products/products.pricing.js';
import type { ProductsRepository } from '../products/products.repository.js';
import { toOrderDto, toTrackingDto } from './orders.dto.js';
import { orderConfirmationEmail } from './orders.emails.js';
import type { NewOrder, OrderRecord, OrdersRepository } from './orders.repository.js';
import type { CreateOrderInput, ListOrdersQuery, QuoteInput } from './orders.schemas.js';
import { priceOrder, tierFor, type PromoRule } from './orders.pricing.js';
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
  loyalty: LoyaltyRepository;
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
  loyalty,
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
      (await products.findSellableVariants([...quantities.keys()])).map((v) => [v.variantId, v] as const),
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
        quantity,
      };
    });
  }

  /** Ce que le calcul doit savoir du client connecté : nouveau client, niveau, usages du code, solde de points. */
  async function customerContext(customerId: string | null, promo: PromoRule | null) {
    if (!customerId) return null;
    const [isNew, spend, settings, codeUses, pointsBalance] = await Promise.all([
      loyalty.isNewCustomer(customerId),
      loyalty.qualifyingSpend(customerId),
      loyalty.settings(),
      promo ? promoCodes.customerUses(promo.id, customerId) : Promise.resolve(0),
      loyalty.balance(customerId),
    ]);
    const tier = tierFor(spend, { silver: settings.silverThreshold, gold: settings.goldThreshold });
    return { id: customerId, isNew, tier, codeUses, pointsBalance };
  }

  async function availableZone(zoneId: string) {
    const zone = await zones.findById(zoneId);
    if (!zone?.available) throw new UnprocessableError('Cette zone n’est plus desservie : choisissez-en une autre.');
    return zone;
  }

  /**
   * Devis du panier : prix de la base, promotion en vigueur, code, points et frais de la zone (11, 12.2).
   * Sans zone (panier, avant le choix du quartier), la livraison n'est pas comptée.
   * Un code inconnu est signalé comme une erreur de code, sans révéler l'existence d'autres codes.
   */
  async function quoteFor(
    input: Omit<QuoteInput, 'zoneId'>,
    zone: DeliveryZoneRecord | null,
    customerId: string | null,
    at: Date,
  ) {
    const items = await priceLines(input, at);
    const promo = input.promoCode ? await promoCodes.findByCode(input.promoCode) : null;
    const [customer, settings] = await Promise.all([customerContext(customerId, promo), loyalty.settings()]);
    const priced = priceOrder(items, {
      deliveryFee: zone?.fee ?? 0,
      promo,
      pointsRequested: input.points ?? 0,
      customer,
      maxDiscountRate: settings.maxDiscountRate,
      now: at,
    });
    const codeError = input.promoCode && !promo ? 'Ce code n’existe pas.' : priced.codeError;
    return { items, promo: codeError ? null : promo, priced: { ...priced, codeError } };
  }

  async function notify(order: OrderRecord) {
    try {
      await email.send(orderConfirmationEmail(order, appUrl));
    } catch (err) {
      // La commande est enregistrée : l'échec du dépôt de l'e-mail ne doit pas la faire paraître perdue
      logger.error({ err, orderId: order.id }, 'E-mail de confirmation non déposé');
    }
    await notifier.notifyStaff('commandes:consulter', newOrderMessage(order, appUrl), true);
  }

  return {
    /**
     * Passage de commande. Idempotent : la même clé renvoie la même commande, jamais un doublon.
     * Les prix, la promotion en vigueur et les frais de livraison sont ceux de la base.
     */
    async place(input: CreateOrderInput, customerId: string | null) {
      const existing = await orders.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return replay(existing, customerId);

      const at = now();
      const zone = await availableZone(input.delivery.zoneId);
      const { items, promo, priced } = await quoteFor(
        { lines: input.lines, promoCode: input.promoCode, points: input.points },
        zone,
        customerId,
        at,
      );
      // La commande ne passe qu'au prix annoncé : un code ou des points refusés bloquent la commande
      if (priced.codeError) throw new AppError(priced.codeError, 422, 'PROMO_CODE_REJECTED');
      if (priced.pointsError) throw new AppError(priced.pointsError, 422, 'POINTS_REJECTED');
      // Signaux anti-fraude (19.3) : la commande passe, mais attend une vérification avant la préparation
      const key = phoneKey(input.delivery.phone);
      const [history, reviewAmount] = await Promise.all([
        orders.riskHistory(key, input.delivery.email, at),
        orders.reviewThreshold(),
      ]);
      const reviewReasons = suspicionReasons(
        {
          total: priced.total,
          subtotal: priced.subtotal,
          discounts: priced.codeDiscount + priced.pointsDiscount,
          quantities: input.lines.map((l) => l.quantity),
        },
        history,
        reviewAmount,
      );
      const order: Omit<NewOrder, 'number'> = {
        phoneKey: key,
        reviewReasons,
        reviewStatus: reviewReasons.length ? 'pending' : null,
        trackingCode: randomReadableCode(6),
        customerId,
        idempotencyKey: input.idempotencyKey,
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
        promoCode: promo?.code ?? null,
        promoCodeId: promo?.id ?? null,
        pointsUsed: priced.pointsUsed,
        paymentMethod: input.paymentMethod,
        // Paiement à la réception, quel que soit le moyen (cahier des charges, 8.4 à 8.6)
        paymentStatus: 'awaiting_payment',
        items: items.map(({ categoryIds: _c, ...item }) => item),
      };

      for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt++) {
        const result = await orders.create({ ...order, number: orderNumber(at) });
        if (result.outcome === 'created') {
          await notify(result.order);
          return { order: toOrderDto(result.order), created: true };
        }
        if (result.outcome === 'out_of_stock') {
          const byId = new Map(items.map((i) => [i.variantId, i] as const));
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
        if (result.outcome === 'points_unavailable')
          throw new AppError('Votre solde de points a changé : vérifiez-le puis réessayez.', 409, 'POINTS_REJECTED');
        if (result.outcome === 'duplicate_request') {
          // Même clé envoyée deux fois au même instant : la première a gagné
          const winner = await orders.findByIdempotencyKey(input.idempotencyKey);
          if (winner) return replay(winner, customerId);
        }
        // Numéro déjà pris (tirage au hasard) : nouvel essai avec un autre numéro
      }
      throw new Error('Impossible d’attribuer un numéro de commande unique.');
    },

    /** Devis du panier avant commande : totaux, points utilisés et gagnés, erreurs de code ou de points. */
    async quote(input: QuoteInput, customerId: string | null) {
      const zone = input.zoneId ? await availableZone(input.zoneId) : null;
      const { priced } = await quoteFor(input, zone, customerId, now());
      return { zone: zone && { id: zone.id, name: zone.name }, totals: priced };
    },

    /** Historique du compte : les 3 dernières années ; les plus anciennes restent dans les archives comptables. */
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

    /** Réponse du client aux nouveaux frais de livraison (9.5) : rien ne change sans son accord. */
    async decideFeeChange(customerId: string, orderId: string, accept: boolean) {
      const order = await ownOrder(customerId, orderId);
      if (order.feeChange?.status !== 'pending')
        throw new ConflictError('Aucun changement de frais n’attend votre réponse.');
      const result = await orders.decideFeeChange(order, accept, now());
      if (result.outcome === 'stale') throw new ConflictError('La commande a changé entre-temps : rechargez la page.');
      return toOrderDto(result.order);
    },

    /**
     * Contestation d'une livraison marquée « Livrée » (9.6) : la réclamation est ouverte sans effacer ce statut ;
     * l'enquête et sa résolution sont suivies à part.
     */
    async disputeDelivery(customerId: string, orderId: string, reason: string) {
      const order = await ownOrder(customerId, orderId);
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
      const order = await orders.findByNumber(number.trim().toUpperCase());
      const unknown = new NotFoundError('Aucune commande ne correspond à ce numéro et ce code.');
      if (!order || !safeEqual(order.trackingCode, code.trim().toUpperCase())) throw unknown;
      if (order.customerId === customerId) throw new ConflictError('Cette commande est déjà dans votre compte.');
      if (order.customerId) throw unknown;
      const accountEmail = await accounts.emailOf(customerId);
      if (!accountEmail || accountEmail.toLowerCase() !== order.email.toLowerCase())
        throw new UnprocessableError(
          'Cette commande a été passée avec une autre adresse e-mail que celle de votre compte.',
        );
      if (!(await orders.claim(order.id, customerId))) throw unknown;
      return toOrderDto((await orders.findById(order.id)) ?? order);
    },

    /**
     * Suivi sans compte : numéro et code de suivi reçus par e-mail. Une réponse unique pour « inconnu » et
     * « mauvais code » ; aucune coordonnée du client dans la réponse.
     */
    async track(number: string, code: string) {
      const order = await orders.findByNumber(number.trim().toUpperCase());
      if (!order || !safeEqual(order.trackingCode, code.trim().toUpperCase()))
        throw new NotFoundError('Aucune commande ne correspond à ce numéro et ce code.');
      return toTrackingDto(order);
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
