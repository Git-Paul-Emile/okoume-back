import { randomUUID } from 'node:crypto';
import type { CategoriesRepository, CategoryRecord } from '../src/features/categories/categories.repository.js';
import type {
  DeliveryZoneRecord,
  DeliveryZonesRepository,
} from '../src/features/delivery-zones/delivery-zones.repository.js';
import type {
  AppliedTransition,
  OrderActor,
  OrderRecord,
  OrdersRepository,
} from '../src/features/orders/orders.repository.js';
import type { ProductRecord, ProductsRepository, VariantRecord } from '../src/features/products/products.repository.js';
import type { PaymentRecord, PaymentsRepository } from '../src/features/payments/payments.repository.js';
import type {
  LoyaltyMovementRecord,
  LoyaltyRepository,
  ShopSettingsRecord,
} from '../src/features/loyalty/loyalty.repository.js';
import type {
  LoyaltyRewardsRepository,
  ReferralRewardRecord,
} from '../src/features/loyalty-rewards/loyalty-rewards.repository.js';
import { personalCode, referralSignals } from '../src/features/loyalty-rewards/loyalty-rewards.rules.js';
import type { CourierRecord, CouriersRepository } from '../src/features/staff-couriers/staff-couriers.repository.js';
import type { InvoiceRecord, InvoicesRepository } from '../src/features/invoices/invoices.repository.js';
import { creditNoteContent, documentNumber, invoiceContent } from '../src/features/invoices/invoices.rules.js';
import type { PromoCodeRecord, PromoCodesRepository } from '../src/features/promo-codes/promo-codes.repository.js';
import type { ReturnActor, ReturnRecord, ReturnsRepository } from '../src/features/returns/returns.repository.js';
import type { StockMovementRecord, StockRepository } from '../src/features/staff-stock/staff-stock.repository.js';

/**
 * Catalogue et commandes en mémoire pour les tests unitaires et HTTP. La réservation suit la même règle
 * que la transaction réelle : tout ou rien. La recherche se limite aux produits publiés et à la pagination ;
 * filtres et tris SQL sont couverts par les tests d'intégration sur base réelle.
 */
/** Ce que les récompenses lisent d'un client : prénom, téléphone, parrain, anniversaire. */
export interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  referralCode: string;
  referredById: string | null;
  birthDate: Date | null;
  birthdayChoice: 'points' | 'code';
  status: 'active' | 'pending_verification' | 'anonymized';
}

export function createMemoryCatalog(now: () => Date) {
  const categories: CategoryRecord[] = [];
  const products: ProductRecord[] = [];
  const zones: DeliveryZoneRecord[] = [];
  const orders: OrderRecord[] = [];
  // Seuil de montant des commandes à vérifier (paramètres de la boutique) ; 0 : contrôle du montant désactivé
  const reviewAmount = { value: 0 };
  const manualMovements: Array<StockMovementRecord & { variantId: string }> = [];
  const movements: Array<{
    variantId: string;
    type: 'commande' | 'annulation' | 'retour' | 'non_vendable' | 'mise_au_rebut';
    delta: number;
  }> = [];
  const returns: ReturnRecord[] = [];
  const promos: PromoCodeRecord[] = [];
  const loyaltyMovements: Array<LoyaltyMovementRecord & { customerId: string }> = [];
  const settings: ShopSettingsRecord = {
    maxDiscountRate: 0.5,
    silverThreshold: 300_000,
    goldThreshold: 1_000_000,
    deliveryVatRate: 18,
    referralReward: 300,
    welcomeEnabled: true,
    welcomePercent: 10,
    welcomeValidDays: 30,
    birthdayEnabled: true,
    birthdayPoints: 200,
    birthdayPercent: 10,
    birthdayValidDays: 30,
    maxAddresses: 5,
  };
  const invoices: InvoiceRecord[] = [];
  const sequences = new Map<string, number>();
  const nextDocumentNumber = (type: 'invoice' | 'credit_note', at: Date) => {
    const key = `${type}-${at.getUTCFullYear()}`;
    const next = (sequences.get(key) ?? 0) + 1;
    sequences.set(key, next);
    return documentNumber(type, at.getUTCFullYear(), next);
  };
  /** Mêmes règles qu'issueInvoice : une facture par commande, figée à l'émission. */
  const issueInvoiceInMemory = (order: OrderRecord, at: Date) => {
    if (invoices.some((i) => i.orderId === order.id && i.type === 'invoice')) return;
    invoices.push({
      ...invoiceContent(order, settings.deliveryVatRate),
      id: randomUUID(),
      number: nextDocumentNumber('invoice', at),
      type: 'invoice',
      orderId: order.id,
      orderNumber: order.number,
      customerId: order.customerId,
      issuedAt: at,
      relatedNumber: null,
      reason: null,
    });
  };
  /** Mêmes règles qu'issueCreditNote : liée à la facture, jamais au-delà de son montant. */
  const issueCreditNoteInMemory = (orderId: string, amount: number, reason: string, at: Date) => {
    const invoice = invoices.find((i) => i.orderId === orderId && i.type === 'invoice');
    if (!invoice) return;
    const credited = invoices.filter((i) => i.relatedNumber === invoice.number).reduce((s, i) => s + i.totals.ttc, 0);
    const value = Math.min(amount, invoice.totals.ttc - credited);
    if (value <= 0) return;
    invoices.push({
      ...creditNoteContent(invoice, value),
      id: randomUUID(),
      number: nextDocumentNumber('credit_note', at),
      type: 'credit_note',
      orderId,
      orderNumber: invoice.orderNumber,
      customerId: invoice.customerId,
      issuedAt: at,
      relatedNumber: invoice.number,
      reason,
    });
  };

  const addMovement = (m: Omit<LoyaltyMovementRecord, 'id' | 'createdAt'> & { customerId: string }) =>
    loyaltyMovements.push({ ...m, id: randomUUID(), createdAt: now() });
  const earnedFor = (orderId: string) =>
    Math.max(
      0,
      loyaltyMovements
        .filter((m) => m.orderId === orderId && (m.type === 'earn' || m.type === 'reversal'))
        .reduce((sum, m) => sum + m.points, 0),
    );
  const balanceOf = (customerId: string) =>
    loyaltyMovements.filter((m) => m.customerId === customerId).reduce((sum, m) => sum + m.points, 0);
  /** Même règle que creditEarnedPoints : livrée et payée, une seule fois, hors livraison. */
  const customers: CustomerProfile[] = [];
  const referralRewards: ReferralRewardRecord[] = [];
  const birthdayRewards: Array<{ customerId: string; year: number; choice: 'points' | 'code' }> = [];

  /** Même règle que rewardFirstOrder : bienvenue et parrainage à la première commande livrée et payée. */
  const rewardFirstOrderInMemory = (order: OrderRecord) => {
    const customer = customers.find((c) => c.id === order.customerId);
    if (!customer || order.status !== 'delivered' || order.paymentStatus !== 'paid') return;
    const earlier = orders.some(
      (o) =>
        o.id !== order.id &&
        o.customerId === customer.id &&
        o.status === 'delivered' &&
        ['paid', 'refund_due', 'refunded'].includes(o.paymentStatus),
    );
    if (earlier) return;
    if (settings.welcomeEnabled && !promos.some((p) => p.customerId === customer.id && p.code.startsWith('MERCI-')))
      promos.push({
        id: randomUUID(),
        code: personalCode('MERCI'),
        label: `Merci ${customer.firstName} : ${settings.welcomePercent} % sur votre prochaine commande`,
        type: 'percent',
        value: settings.welcomePercent,
        minAmount: 0,
        freeDelivery: false,
        newCustomersOnly: false,
        tiers: [],
        startsAt: now(),
        endsAt: new Date(now().getTime() + settings.welcomeValidDays * 86_400_000),
        maxUses: 1,
        perCustomer: 1,
        uses: 0,
        active: true,
        customerId: customer.id,
        productIds: [],
        categoryIds: [],
        createdAt: now(),
      });
    const referrer = customers.find((c) => c.id === customer.referredById && c.status === 'active');
    if (!referrer || settings.referralReward <= 0 || referralRewards.some((r) => r.refereeId === customer.id)) return;
    const signals = referralSignals({
      referrer: {
        phone: referrer.phone,
        addresses: orders
          .filter((o) => o.customerId === referrer.id)
          .map((o) => ({ zoneId: o.zoneId, landmark: o.landmark })),
      },
      referee: { phone: customer.phone },
      order: { phone: order.phone, zoneId: order.zoneId, landmark: order.landmark, total: order.totals.total },
      recentReferrals: referralRewards.filter(
        (r) =>
          r.referrerId === referrer.id &&
          r.status !== 'rejected' &&
          r.createdAt.getTime() >= order.createdAt.getTime() - 7 * 86_400_000,
      ).length,
    });
    referralRewards.push({
      id: randomUUID(),
      referrerId: referrer.id,
      refereeId: customer.id,
      refereeName: `${customer.firstName} ${customer.lastName.slice(0, 1)}.`,
      orderId: order.id,
      orderNumber: order.number,
      points: settings.referralReward,
      status: signals.length ? 'pending' : 'granted',
      signals,
      decisionNote: null,
      createdAt: now(),
    });
    if (!signals.length)
      addMovement({
        customerId: referrer.id,
        points: settings.referralReward,
        type: 'referral',
        label: `Parrainage de ${customer.firstName} (${order.number})`,
        orderId: order.id,
      });
  };

  const creditEarned = (order: OrderRecord) => {
    if (!order.customerId || order.status !== 'delivered' || order.paymentStatus !== 'paid') return;
    if (loyaltyMovements.some((m) => m.orderId === order.id && m.type === 'earn')) return;
    const t = order.totals;
    const points = Math.floor(Math.max(0, t.subtotal - t.codeDiscount - t.pointsDiscount) / 1_000);
    if (points > 0)
      addMovement({
        customerId: order.customerId,
        points,
        type: 'earn',
        label: `Commande ${order.number} livrée et payée`,
        orderId: order.id,
      });
  };
  const unsellable = new Map<string, number>();

  const variantById = (id: string) => {
    for (const p of products) {
      const variant = p.variants.find((v) => v.id === id);
      if (variant) return { product: p, variant };
    }
    return undefined;
  };

  const categoriesRepository: CategoriesRepository = { findAll: async () => categories };

  const productsRepository: ProductsRepository = {
    async search(c) {
      const published = products.filter((p) => p.status === 'published');
      const start = (c.page - 1) * c.limit;
      return { ids: published.slice(start, start + c.limit).map((p) => p.id), total: published.length };
    },
    findByIds: async (ids) => ids.flatMap((id) => products.find((p) => p.id === id) ?? []),
    findPublishedBySlug: async (slug) => products.find((p) => p.slug === slug && p.status === 'published') ?? null,
    findSellableVariants: async (ids) =>
      ids.flatMap((id) => {
        const found = variantById(id);
        if (!found) return [];
        const { product, variant } = found;
        return [
          {
            variantId: variant.id,
            productId: product.id,
            productName: product.name,
            categoryId: product.categoryId,
            published: product.status === 'published',
            label: variant.label,
            price: variant.price,
            image: variant.image ?? product.images[0] ?? '',
            vatRate: product.vatRate,
            promotion: product.promotion,
          },
        ];
      }),
  };

  const zonesRepository: DeliveryZonesRepository = {
    findAvailable: async () => zones.filter((z) => z.available),
    findById: async (id) => zones.find((z) => z.id === id) ?? null,
  };

  const ordersRepository: OrdersRepository = {
    async create(order) {
      if (orders.some((o) => o.idempotencyKey === order.idempotencyKey)) return { outcome: 'duplicate_request' };
      if (orders.some((o) => o.number === order.number)) return { outcome: 'number_taken' };
      const quantities = new Map<string, number>();
      for (const i of order.items) quantities.set(i.variantId, (quantities.get(i.variantId) ?? 0) + i.quantity);
      const shortages = [...quantities].flatMap(([variantId, quantity]) => {
        const v = variantById(variantId)?.variant;
        const available = v ? v.stock - v.reserved : 0;
        return available < quantity ? [{ variantId, available }] : [];
      });
      if (shortages.length) return { outcome: 'out_of_stock', shortages };
      const promo = order.promoCodeId ? promos.find((p) => p.id === order.promoCodeId) : undefined;
      if (promo) {
        const used = orders.filter(
          (o) => o.promoCodeId === promo.id && o.customerId === order.customerId && o.status !== 'cancelled',
        ).length;
        if (!promo.active || (promo.maxUses !== null && promo.uses >= promo.maxUses))
          return { outcome: 'promo_unavailable' };
        if (promo.perCustomer !== null && order.customerId && used >= promo.perCustomer)
          return { outcome: 'promo_unavailable' };
      }
      if (order.pointsUsed > 0 && balanceOf(order.customerId ?? '') < order.pointsUsed)
        return { outcome: 'points_unavailable' };
      if (promo) promo.uses += 1;
      for (const [variantId, quantity] of quantities) variantById(variantId)!.variant.reserved += quantity;
      const created: OrderRecord = {
        ...order,
        id: randomUUID(),
        status: 'confirmed',
        paymentDeclaration: null,
        review: order.reviewStatus
          ? { status: 'pending', reasons: order.reviewReasons, note: null, by: null, at: null }
          : null,
        events: [
          {
            status: 'confirmed',
            fromStatus: null,
            note: null,
            actor: order.customerId ? 'customer' : 'system',
            by: null,
            createdAt: now(),
          },
        ],
        cancellation: null,
        courierId: null,
        deliveryCost: null,
        feeChange: null,
        dispute: null,
        createdAt: now(),
      };
      orders.push(created);
      if (order.pointsUsed > 0 && order.customerId)
        addMovement({
          customerId: order.customerId,
          points: -order.pointsUsed,
          type: 'redeem',
          label: `Points utilisés sur la commande ${order.number}`,
          orderId: created.id,
        });
      return { outcome: 'created', order: created };
    },
    findByIdempotencyKey: async (key) => orders.find((o) => o.idempotencyKey === key) ?? null,
    findForCustomer: async (id, customerId) => orders.find((o) => o.id === id && o.customerId === customerId) ?? null,
    async listForCustomer(customerId, since, { page, limit }, number) {
      const mine = orders
        .filter((o) => o.customerId === customerId && o.createdAt >= since && (!number || o.number === number))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return { items: mine.slice((page - 1) * limit, page * limit), total: mine.length };
    },
    findById: async (id) => orders.find((o) => o.id === id) ?? null,
    findByNumber: async (number) => orders.find((o) => o.number === number) ?? null,
    async listForStaff({ status, search, page, limit }) {
      const matching = orders
        .filter(
          (o) =>
            (!status || o.status === status) && (!search || o.number.includes(search) || o.recipient.includes(search)),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return { items: matching.slice((page - 1) * limit, page * limit), total: matching.length };
    },
    async applyTransition(order, change, actor) {
      const stored = orders.find((o) => o.id === order.id);
      if (!stored || stored.status !== change.from) return { outcome: 'stale' };
      apply(stored, change, actor);
      return { outcome: 'applied', order: stored };
    },
    async setDeliveryCost(orderId, cost) {
      const stored = orders.find((o) => o.id === orderId);
      if (!stored) return null;
      stored.deliveryCost = cost;
      return stored;
    },
    async proposeFeeChange(order, { toFee, reason }) {
      const stored = orders.find((o) => o.id === order.id)!;
      if (stored.feeChange?.status === 'pending') return false;
      stored.feeChange = {
        id: randomUUID(),
        fromFee: stored.totals.deliveryFee - stored.totals.deliveryDiscount,
        toFee,
        reason,
        status: 'pending',
        createdAt: now(),
      };
      return true;
    },
    async decideFeeChange(order, accept) {
      const stored = orders.find((o) => o.id === order.id);
      const change = stored?.feeChange;
      if (!stored || !change || change.status !== 'pending') return { outcome: 'stale' };
      if (accept && stored.paymentStatus !== 'awaiting_payment') return { outcome: 'stale' };
      change.status = accept ? 'accepted' : 'refused';
      if (accept) {
        const diff = change.toFee - change.fromFee;
        stored.totals = {
          ...stored.totals,
          deliveryFee: stored.totals.deliveryFee + diff,
          total: stored.totals.total + diff,
        };
      }
      stored.events.push({
        status: stored.status,
        fromStatus: stored.status,
        note: accept ? 'Nouveaux frais de livraison acceptés par le client' : 'Nouveaux frais de livraison refusés',
        actor: 'customer',
        by: null,
        createdAt: now(),
      });
      return { outcome: 'applied', order: stored };
    },
    async riskHistory(phoneKey, email, at) {
      const keyOf = (phone: string) => phone.replace(/\D/g, '').slice(-8);
      const mine = orders.filter((o) => keyOf(o.phone) === phoneKey);
      const day = at.getTime() - 24 * 60 * 60_000;
      const month = at.getTime() - 30 * 24 * 60 * 60_000;
      return {
        recentOrders: mine.filter((o) => o.createdAt.getTime() >= day).length,
        cancelledOrders: mine.filter((o) => o.status === 'cancelled' && o.createdAt.getTime() >= month).length,
        otherEmails: new Set(
          mine
            .filter((o) => o.createdAt.getTime() >= month && o.email.toLowerCase() !== email.toLowerCase())
            .map((o) => o.email.toLowerCase()),
        ).size,
      };
    },
    reviewThreshold: async () => reviewAmount.value,
    async clearReview(orderId, { note, staffId, at }) {
      const by = 'Membre ' + staffId;
      const stored = orders.find((o) => o.id === orderId);
      if (!stored || stored.review?.status !== 'pending') return false;
      stored.review = { ...stored.review, status: 'cleared', note, by, at };
      return true;
    },
    async claim(orderId, customerId) {
      const stored = orders.find((o) => o.id === orderId);
      if (!stored || stored.customerId) return false;
      stored.customerId = customerId;
      return true;
    },
    async declarePayment(orderId, reference, at) {
      const stored = orders.find((o) => o.id === orderId);
      if (!stored || stored.paymentStatus !== 'awaiting_payment' || stored.paymentMethod === 'cash') return false;
      if (stored.status === 'cancelled') return false;
      stored.paymentStatus = 'awaiting_verification';
      stored.paymentDeclaration = { reference, at };
      return true;
    },
    async openDispute(orderId, reason) {
      const stored = orders.find((o) => o.id === orderId)!;
      if (stored.dispute?.status === 'open') return false;
      stored.dispute = { id: randomUUID(), reason, status: 'open', resolution: null, createdAt: now() };
      return true;
    },
    async resolveDispute(orderId, resolution) {
      const stored = orders.find((o) => o.id === orderId);
      if (!stored?.dispute || stored.dispute.status !== 'open') return false;
      stored.dispute = { ...stored.dispute, status: 'resolved', resolution };
      return true;
    },
    async requestCancellation(orderId, request) {
      const stored = orders.find((o) => o.id === orderId);
      if (!stored || stored.cancellation) return false;
      stored.cancellation = { ...request, status: 'pending', decisionReason: null, createdAt: now() };
      return true;
    },
    async decideCancellation(order, { accept, reason, staffId }, cancellation) {
      const stored = orders.find((o) => o.id === order.id);
      if (!stored?.cancellation || stored.cancellation.status !== 'pending') return { outcome: 'stale' };
      if (cancellation && stored.status !== cancellation.from) return { outcome: 'stale' };
      stored.cancellation = { ...stored.cancellation, status: accept ? 'accepted' : 'refused', decisionReason: reason };
      if (cancellation) apply(stored, cancellation, { type: 'staff', staffId });
      return { outcome: 'applied', order: stored };
    },
  };

  const payments: Array<PaymentRecord & { orderId: string }> = [];
  const paymentsRepository: PaymentsRepository = {
    listForOrder: async (orderId) => payments.filter((p) => p.orderId === orderId),
    async record(order, payment, nextStatus, note, { issuedAt, returnRefund }) {
      const stored = orders.find((o) => o.id === order.id);
      if (!stored || stored.paymentStatus !== order.paymentStatus) return { outcome: 'stale' };
      // Même règle que l'index partiel payments_reference_unique
      const clash =
        payment.kind === 'payment' && payment.reference
          ? payments.find(
              (p) => p.kind === 'payment' && p.reference?.toLowerCase() === payment.reference!.toLowerCase(),
            )
          : undefined;
      if (clash)
        return { outcome: 'reference_taken', orderNumber: orders.find((o) => o.id === clash.orderId)?.number ?? null };
      const { staffId, ...fields } = payment;
      if (returnRefund) {
        const ret = returns.find((r) => r.id === returnRefund.returnId);
        if (!ret || ret.status !== 'refund_due') return { outcome: 'stale' };
        ret.refundedAmount += payment.amount;
        if (stored.customerId && returnRefund.pointsToReverse > 0)
          addMovement({
            customerId: stored.customerId,
            points: -returnRefund.pointsToReverse,
            type: 'reversal',
            label: `Points retirés : articles remboursés (${stored.number})`,
            orderId: stored.id,
          });
        if (returnRefund.completes) {
          ret.status = 'refunded';
          ret.events.push({ status: 'refunded', note, actor: 'staff', by: `Membre ${staffId}`, createdAt: now() });
        }
      }
      payments.push({ ...fields, id: randomUUID(), orderId: order.id, by: `Membre ${staffId}`, createdAt: now() });
      stored.paymentStatus = nextStatus;
      creditEarned(stored);
      rewardFirstOrderInMemory(stored);
      if (payment.kind === 'payment' && nextStatus === 'paid') issueInvoiceInMemory(stored, issuedAt);
      if (payment.kind === 'refund') issueCreditNoteInMemory(stored.id, payment.amount, note, issuedAt);
      stored.events.push({
        status: stored.status,
        fromStatus: stored.status,
        note,
        actor: 'staff',
        by: `Membre ${staffId}`,
        createdAt: now(),
      });
      return { outcome: 'applied' };
    },
    async changeMethod(order, to, note) {
      const stored = orders.find((o) => o.id === order.id);
      if (
        !stored ||
        stored.paymentMethod !== order.paymentMethod ||
        stored.paymentStatus !== 'awaiting_payment' ||
        ['delivered', 'cancelled'].includes(stored.status)
      )
        return false;
      stored.paymentMethod = to;
      stored.events.push({
        status: stored.status,
        fromStatus: stored.status,
        note,
        actor: 'customer',
        by: null,
        createdAt: now(),
      });
      return true;
    },
  };

  const staffName = (actor: ReturnActor) => (actor.type === 'staff' ? `Membre ${actor.staffId}` : null);
  const returnsRepository: ReturnsRepository = {
    findById: async (id) => returns.find((r) => r.id === id) ?? null,
    findByOrder: async (orderId) => returns.find((r) => r.orderId === orderId) ?? null,
    async list({ status, page, limit }) {
      const matching = returns.filter((r) => !status || r.status === status);
      return { items: matching.slice((page - 1) * limit, page * limit), total: matching.length };
    },
    async create(orderId, { items, ...fields }) {
      if (returns.some((r) => r.orderId === orderId)) return null;
      const order = orders.find((o) => o.id === orderId)!;
      const record: ReturnRecord = {
        ...fields,
        id: randomUUID(),
        orderId,
        orderNumber: order.number,
        customerId: order.customerId,
        status: 'pending',
        decisionReason: null,
        shippingPaidBy: null,
        shippingReason: null,
        inspectionNote: null,
        refundAmount: null,
        refundedAmount: 0,
        restockStatus: 'none',
        reopenRequestedAt: null,
        items: items.map((i) => ({ ...i, resaleable: null, unsellable: null })),
        events: [
          { status: 'pending', note: 'Demande de retour envoyée', actor: 'customer', by: null, createdAt: now() },
        ],
        createdAt: now(),
      };
      returns.push(record);
      return record;
    },
    async transition(ret, to, patch, note, actor) {
      const stored = returns.find((r) => r.id === ret.id);
      if (!stored || stored.status !== ret.status) return null;
      Object.assign(stored, patch, { status: to });
      stored.events.push({ status: to, note, actor: actor.type, by: staffName(actor), createdAt: now() });
      return stored;
    },
    async inspect(ret, inspection, staffId) {
      const stored = returns.find((r) => r.id === ret.id);
      if (!stored || stored.status !== ret.status) return null;
      for (const line of inspection.lines) {
        Object.assign(
          stored.items.find((i) => i.variantId === line.variantId)!,
          line,
        );
        if (line.unsellable) {
          unsellable.set(line.variantId, (unsellable.get(line.variantId) ?? 0) + line.unsellable);
          movements.push({ variantId: line.variantId, type: 'non_vendable', delta: line.unsellable });
        }
      }
      Object.assign(stored, {
        status: inspection.next,
        inspectionNote: inspection.note,
        refundAmount: inspection.refundAmount,
        restockStatus: inspection.lines.some((l) => l.resaleable > 0) ? 'pending' : 'none',
      });
      const order = orders.find((o) => o.id === ret.orderId)!;
      if (inspection.orderRefundDue && order.paymentStatus === 'paid') order.paymentStatus = 'refund_due';
      stored.events.push({
        status: inspection.next,
        note: inspection.note,
        actor: 'staff',
        by: `Membre ${staffId}`,
        createdAt: now(),
      });
      return stored;
    },
    async restock(ret, staffId) {
      const stored = returns.find((r) => r.id === ret.id);
      if (!stored || stored.restockStatus !== 'pending') return null;
      stored.restockStatus = 'done';
      for (const item of stored.items) {
        if (!item.resaleable) continue;
        variantById(item.variantId)!.variant.stock += item.resaleable;
        movements.push({ variantId: item.variantId, type: 'retour', delta: item.resaleable });
      }
      stored.events.push({
        status: stored.status,
        note: 'Articles revendables remis en stock',
        actor: 'staff',
        by: `Membre ${staffId}`,
        createdAt: now(),
      });
      return stored;
    },
    async writeOff(variantId, entry) {
      if (!variantById(variantId)) return { outcome: 'not_found' };
      const before = unsellable.get(variantId) ?? 0;
      if (before < entry.quantity) return { outcome: 'insufficient', unsellable: before };
      unsellable.set(variantId, before - entry.quantity);
      movements.push({ variantId, type: 'mise_au_rebut', delta: -entry.quantity });
      return { outcome: 'applied', unsellableLeft: before - entry.quantity };
    },
  };

  const promoCodesRepository: PromoCodesRepository = {
    findByCode: async (code) => promos.find((p) => p.code === code.trim().toUpperCase()) ?? null,
    findById: async (id) => promos.find((p) => p.id === id) ?? null,
    publicCodes: async (at) =>
      promos.filter(
        (p) =>
          p.customerId === null &&
          !p.newCustomersOnly &&
          p.active &&
          p.startsAt <= at &&
          p.endsAt >= at &&
          (p.maxUses === null || p.uses < p.maxUses),
      ),
    personalFor: async (customerId, at) =>
      promos.filter(
        (p) =>
          p.customerId === customerId &&
          p.active &&
          p.startsAt <= at &&
          p.endsAt >= at &&
          (p.maxUses === null || p.uses < p.maxUses),
      ),
    customerUses: async (promoCodeId, customerId) =>
      orders.filter((o) => o.promoCodeId === promoCodeId && o.customerId === customerId && o.status !== 'cancelled')
        .length,
    async list({ page, limit }) {
      return { items: promos.slice((page - 1) * limit, page * limit), total: promos.length };
    },
    async create(fields) {
      if (promos.some((p) => p.code === fields.code)) return null;
      const record: PromoCodeRecord = { ...fields, id: randomUUID(), uses: 0, createdAt: now() };
      promos.push(record);
      return record;
    },
    async update(id, fields) {
      const found = promos.find((p) => p.id === id);
      if (!found) return undefined;
      if (fields.code && promos.some((p) => p.id !== id && p.code === fields.code)) return null;
      return Object.assign(found, fields);
    },
  };

  const loyaltyRepository: LoyaltyRepository = {
    balance: async (customerId) => balanceOf(customerId),
    async movements(customerId, { page, limit }) {
      const mine = loyaltyMovements.filter((m) => m.customerId === customerId).reverse();
      return {
        items: mine.slice((page - 1) * limit, page * limit).map(({ customerId: _c, ...m }) => m),
        total: mine.length,
      };
    },
    qualifyingSpend: async (customerId) =>
      orders
        .filter(
          (o) =>
            o.customerId === customerId &&
            o.status === 'delivered' &&
            ['paid', 'refund_due', 'refunded'].includes(o.paymentStatus),
        )
        .reduce((sum, o) => {
          const refunded = payments
            .filter((p) => p.orderId === o.id && p.kind === 'refund')
            .reduce((x, p) => x + p.amount, 0);
          return sum + Math.max(0, o.totals.total - refunded);
        }, 0),
    isNewCustomer: async (customerId) => !orders.some((o) => o.customerId === customerId && o.status !== 'cancelled'),
    earnedFor: async (orderId) => earnedFor(orderId),
    settings: async () => ({ ...settings }),
    async updateSettings(patch) {
      Object.assign(settings, patch);
      return { ...settings };
    },
    async adjust(customerId, points, label, staffId) {
      addMovement({ customerId, points, type: 'adjust', label: `${label} (Membre ${staffId})`, orderId: null });
      const last = loyaltyMovements.at(-1)!;
      return {
        id: last.id,
        points: last.points,
        type: last.type,
        label: last.label,
        orderId: last.orderId,
        createdAt: last.createdAt,
      };
    },
  };

  const invoicesRepository: InvoicesRepository = {
    listForOrder: async (orderId) => invoices.filter((i) => i.orderId === orderId),
    findById: async (id) => invoices.find((i) => i.id === id) ?? null,
    async list({ type, page, limit }) {
      const matching = invoices.filter((i) => !type || i.type === type).reverse();
      return { items: matching.slice((page - 1) * limit, page * limit), total: matching.length };
    },
  };

  const couriers: CourierRecord[] = [];
  const couriersRepository: CouriersRepository = {
    list: async ({ zoneId, active }) =>
      couriers.filter((c) => (active === undefined || c.active === active) && (!zoneId || c.zoneIds.includes(zoneId))),
    findById: async (id) => couriers.find((c) => c.id === id) ?? null,
    async create(fields) {
      const record = { ...fields, id: randomUUID() };
      couriers.push(record);
      return record;
    },
    async update(id, fields) {
      const found = couriers.find((c) => c.id === id);
      return found ? Object.assign(found, fields) : null;
    },
  };

  const loyaltyRewardsRepository: LoyaltyRewardsRepository = {
    async listReferrals({ status, page, limit }) {
      const matching = referralRewards.filter((r) => !status || r.status === status);
      return { items: matching.slice((page - 1) * limit, page * limit), total: matching.length };
    },
    async decideReferral(id, { grant, note }) {
      const reward = referralRewards.find((r) => r.id === id);
      if (!reward || reward.status !== 'pending') return false;
      reward.status = grant ? 'granted' : 'rejected';
      reward.decisionNote = note;
      if (grant)
        addMovement({
          customerId: reward.referrerId,
          points: reward.points,
          type: 'referral',
          label: `Parrainage de ${reward.refereeName} (${reward.orderNumber})`,
          orderId: reward.orderId,
        });
      return true;
    },
    birthdayCandidates: async (days, year) =>
      customers
        .filter(
          (c) =>
            c.status === 'active' &&
            c.birthDate &&
            days.some((d) => c.birthDate!.getUTCMonth() + 1 === d.month && c.birthDate!.getUTCDate() === d.day) &&
            !birthdayRewards.some((b) => b.customerId === c.id && b.year === year),
        )
        .map((c) => ({ id: c.id, firstName: c.firstName, birthdayChoice: c.birthdayChoice })),
    async grantBirthday(customer, year, reward, at) {
      if (birthdayRewards.some((b) => b.customerId === customer.id && b.year === year)) return false;
      birthdayRewards.push({ customerId: customer.id, year, choice: customer.birthdayChoice });
      if (customer.birthdayChoice === 'points') {
        if (reward.points > 0)
          addMovement({
            customerId: customer.id,
            points: reward.points,
            type: 'birthday',
            label: `Joyeux anniversaire ${year}`,
            orderId: null,
          });
        return true;
      }
      promos.push({
        id: randomUUID(),
        code: personalCode('ANNIV'),
        label: `Joyeux anniversaire ${customer.firstName}`,
        type: 'percent',
        value: reward.percent,
        minAmount: 0,
        freeDelivery: false,
        newCustomersOnly: false,
        tiers: [],
        startsAt: at,
        endsAt: new Date(at.getTime() + reward.validDays * 86_400_000),
        maxUses: 1,
        perCustomer: 1,
        uses: 0,
        active: true,
        customerId: customer.id,
        productIds: [],
        categoryIds: [],
        createdAt: at,
      });
      return true;
    },
    async referralInfo(customerId) {
      const customer = customers.find((c) => c.id === customerId);
      if (!customer) return null;
      return {
        referralCode: customer.referralCode,
        referees: customers.filter((c) => c.referredById === customerId).length,
        rewarded: referralRewards.filter((r) => r.referrerId === customerId && r.status === 'granted').length,
      };
    },
    async updatePreferences(customerId, preferences) {
      const customer = customers.find((c) => c.id === customerId);
      if (customer) Object.assign(customer, preferences);
    },
  };

  const addCustomer = (profile: Partial<CustomerProfile> & Pick<CustomerProfile, 'firstName'>) => {
    const record: CustomerProfile = {
      id: randomUUID(),
      lastName: 'Ndong',
      phone: null,
      referralCode: `CLI-${customers.length + 1}`,
      referredById: null,
      birthDate: null,
      birthdayChoice: 'points',
      status: 'active',
      ...profile,
    };
    customers.push(record);
    return record;
  };

  const stockRepository: StockRepository = {
    async adjust(variantId, change, reason, staffId) {
      const variant = variantById(variantId)?.variant;
      if (!variant) return { outcome: 'not_found' };
      const before = variant.stock;
      const after = change.type === 'reception' ? before + change.quantity : change.counted;
      if (after < variant.reserved) return { outcome: 'below_reserved', reserved: variant.reserved };
      variant.stock = after;
      const movement: StockMovementRecord = {
        id: randomUUID(),
        type: change.type,
        before,
        after,
        delta: after - before,
        reason,
        orderId: null,
        by: `Membre ${staffId}`,
        createdAt: now(),
      };
      manualMovements.push({ variantId, ...movement });
      return { outcome: 'applied', movement, available: after - variant.reserved };
    },
    async listMovements(variantId, { page, limit }) {
      const mine = manualMovements.filter((m) => m.variantId === variantId).reverse();
      return { items: mine.slice((page - 1) * limit, page * limit), total: mine.length };
    },
    async listJournal({ page, limit, type }) {
      const all = manualMovements
        .filter((m) => !type || m.type === type)
        .reverse()
        .map((m) => {
          const found = variantById(m.variantId);
          return {
            ...m,
            productId: found?.product.id ?? '',
            productName: found?.product.name ?? '',
            variantLabel: found?.variant.label ?? '',
          };
        });
      return { items: all.slice((page - 1) * limit, page * limit), total: all.length };
    },
  };

  /** Même effet que applyInTransaction : état, étape d'historique, stock et journal des mouvements. */
  function apply(order: OrderRecord, change: AppliedTransition, actor: OrderActor) {
    order.status = change.to;
    if (change.courier === null) order.courierId = null;
    if (change.courier) {
      order.courierId = change.courier.id;
      order.deliveryCost = change.courier.deliveryCost;
    }
    if (change.paymentStatus) order.paymentStatus = change.paymentStatus;
    if (change.to === 'cancelled') {
      const promo = promos.find((p) => p.id === order.promoCodeId);
      if (promo) promo.uses = Math.max(0, promo.uses - 1);
      if (
        order.customerId &&
        order.pointsUsed > 0 &&
        !loyaltyMovements.some((m) => m.orderId === order.id && m.type === 'restore')
      )
        addMovement({
          customerId: order.customerId,
          points: order.pointsUsed,
          type: 'restore',
          label: `Points rendus : commande ${order.number} annulée`,
          orderId: order.id,
        });
      const earned = earnedFor(order.id);
      if (order.customerId && earned > 0)
        addMovement({
          customerId: order.customerId,
          points: -earned,
          type: 'reversal',
          label: `Points retirés : commande ${order.number} annulée`,
          orderId: order.id,
        });
    }
    creditEarned(order);
    rewardFirstOrderInMemory(order);
    order.events.push({
      status: change.to,
      fromStatus: change.from,
      note: change.note ?? null,
      actor: actor.type,
      by: actor.type === 'staff' ? `Membre ${actor.staffId}` : null,
      createdAt: now(),
    });
    if (!change.stock) return;
    for (const item of order.items) {
      const variant = variantById(item.variantId)!.variant;
      if (change.stock === 'release') {
        variant.reserved -= item.quantity;
        continue;
      }
      const delta = change.stock === 'consume' ? -item.quantity : item.quantity;
      if (change.stock === 'consume') variant.reserved -= item.quantity;
      variant.stock += delta;
      movements.push({ variantId: variant.id, type: change.stock === 'consume' ? 'commande' : 'annulation', delta });
    }
  }

  const addCategory = (category: Partial<CategoryRecord> & Pick<CategoryRecord, 'slug' | 'name'>) => {
    const record: CategoryRecord = {
      id: randomUUID(),
      fullName: null,
      parentId: null,
      icon: null,
      image: null,
      imageFit: 'contain',
      position: 0,
      isCollection: false,
      memberIds: [],
      ...category,
    };
    categories.push(record);
    return record;
  };

  const addProduct = (
    product: Partial<Omit<ProductRecord, 'variants'>> & Pick<ProductRecord, 'slug' | 'name' | 'categoryId'>,
    variants: Array<Partial<VariantRecord> & Pick<VariantRecord, 'price' | 'stock'>>,
  ) => {
    const record: ProductRecord = {
      id: randomUUID(),
      sku: `SKU-${products.length + 1}`,
      brand: null,
      shortDescription: 'Description courte',
      description: [],
      specs: [],
      usageTips: null,
      vatRate: 18,
      hsCode: null,
      status: 'published',
      featured: false,
      dealOfTheDay: false,
      isNew: false,
      tags: [],
      promotion: null,
      images: ['https://images.okoume.test/produit.jpg'],
      createdAt: now(),
      ...product,
      variants: variants.map((v, index) => ({
        id: randomUUID(),
        sku: `VAR-${products.length + 1}-${index + 1}`,
        label: `Variante ${index + 1}`,
        attributes: {},
        reserved: 0,
        lowStockThreshold: 3,
        image: null,
        ...v,
      })),
    };
    products.push(record);
    return record;
  };

  const addZone = (zone: Partial<DeliveryZoneRecord> = {}) => {
    const record: DeliveryZoneRecord = {
      id: randomUUID(),
      name: 'Glass',
      city: 'Libreville',
      fee: 2_000,
      eta: '24 h',
      days: 'Du lundi au samedi',
      available: true,
      ...zone,
    };
    zones.push(record);
    return record;
  };

  return {
    categories,
    products,
    zones,
    orders,
    movements,
    returns,
    unsellable,
    promos,
    invoices,
    couriers,
    customers,
    referralRewards,
    birthdayRewards,
    addCustomer,
    reviewAmount,
    loyaltyMovements,
    settings,
    addCategory,
    addProduct,
    addZone,
    repositories: {
      categoriesRepository,
      productsRepository,
      zonesRepository,
      ordersRepository,
      stockRepository,
      paymentsRepository,
      returnsRepository,
      promoCodesRepository,
      loyaltyRepository,
      invoicesRepository,
      couriersRepository,
      loyaltyRewardsRepository,
    },
  };
}
