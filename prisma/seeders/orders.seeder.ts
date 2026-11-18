import { z } from 'zod';
import { customerId } from './customers.seeder.js';
import { zoneId } from './delivery-zones.seeder.js';
import { productId, variantId } from './products.seeder.js';
import { ownerStaffId } from './staff.seeder.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const orderStatus = z.enum([
  'confirmed',
  'preparing',
  'ready',
  'courier_assigned',
  'shipping',
  'delivered',
  'cancelled',
  'claim',
]);
const amount = z.number().int().min(0);

const schema = z.array(
  z.object({
    id: z.string(),
    number: z.string().min(1),
    trackingCode: z.string().min(1),
    userId: z.string().nullable(),
    items: z
      .array(
        z.object({
          productId: z.string(),
          variantId: z.string(),
          name: z.string(),
          variantLabel: z.string(),
          image: z.string(),
          unitPrice: amount,
          originalPrice: amount,
          quantity: z.number().int().positive(),
        }),
      )
      .min(1),
    customer: z.object({
      recipient: z.string().min(1),
      phone: z.string().min(1),
      email: z.string().min(1),
      zoneId: z.string(),
      zoneName: z.string().min(1),
      landmark: z.string(),
    }),
    totals: z.object({
      subtotal: amount,
      productDiscount: amount,
      codeDiscount: amount,
      pointsDiscount: amount,
      deliveryFee: amount,
      deliveryDiscount: amount,
      total: amount,
    }),
    deliveryCost: amount.nullable(),
    pointsUsed: z.number().int().min(0),
    paymentMethod: z.enum(['cash', 'airtel', 'moov']),
    paymentStatus: z.enum(['awaiting_payment', 'awaiting_verification', 'paid', 'refund_due', 'refunded']),
    status: orderStatus,
    history: z.array(z.object({ status: orderStatus, at: isoDate, note: z.string().optional() })).min(1),
    cancellationRequest: z
      .object({
        reason: z.string().min(1),
        comment: z.string(),
        status: z.enum(['pending', 'accepted', 'refused']),
        createdAt: isoDate,
      })
      .nullable(),
    returnRequest: z
      .object({
        items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive() })).min(1),
        reason: z.string().min(1),
        comment: z.string(),
        status: z.literal('pending'),
        createdAt: isoDate,
      })
      .nullable(),
    createdAt: isoDate,
  }),
);

/** Contenu validé de data/orders.json */
export const loadOrders = () => readData('orders.json', schema);

type SeedOrder = z.infer<typeof schema>[number];

const PAID: ReadonlyArray<SeedOrder['paymentStatus']> = ['paid', 'refund_due', 'refunded'];

/** Date de l'encaissement : la livraison si elle a eu lieu, sinon la dernière étape connue. */
const paidAt = (order: SeedOrder) =>
  (order.history.find((h) => h.status === 'delivered') ?? order.history[order.history.length - 1]!).at;

export const orderId = (legacyId: string) => legacyUuid('order', legacyId);

/**
 * Commandes de démonstration avec leurs lignes, leur historique, leurs demandes d'annulation et de retour et
 * leurs encaissements (enregistrés au nom du propriétaire de la boutique). Les factures ne sont pas recréées :
 * l'API les émet à l'encaissement, ces commandes déjà payées n'en ont donc pas.
 */
export const ordersSeeder: Seeder = {
  name: 'orders',
  demo: true,
  async run({ prisma }) {
    const orders = loadOrders();
    const owner = ownerStaffId();
    const { count } = await prisma.order.createMany({
      data: orders.map((o) => ({
        id: orderId(o.id),
        number: o.number,
        trackingCode: o.trackingCode,
        customerId: o.userId ? customerId(o.userId) : null,
        // Clé propre au navigateur qui a passé la commande : celles du json-server ne sont pas uniques
        idempotencyKey: `seed:${o.id}`,
        recipient: o.customer.recipient,
        phone: o.customer.phone,
        email: o.customer.email,
        zoneId: zoneId(o.customer.zoneId),
        zoneName: o.customer.zoneName,
        landmark: o.customer.landmark,
        ...o.totals,
        deliveryCost: o.deliveryCost,
        pointsUsed: o.pointsUsed,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        status: o.status,
        createdAt: o.createdAt,
      })),
      skipDuplicates: true,
    });

    await prisma.orderItem.createMany({
      data: orders.flatMap((o) =>
        o.items.map((item, index) => ({
          id: legacyUuid('order-item', `${o.id}:${index}`),
          orderId: orderId(o.id),
          productId: productId(item.productId),
          variantId: variantId(item.variantId),
          name: item.name,
          variantLabel: item.variantLabel,
          image: item.image,
          unitPrice: item.unitPrice,
          originalPrice: item.originalPrice,
          vatRate: 18,
          quantity: item.quantity,
        })),
      ),
      skipDuplicates: true,
    });

    await prisma.orderEvent.createMany({
      data: orders.flatMap((o) =>
        o.history.map((step, index) => ({
          id: legacyUuid('order-event', `${o.id}:${index}`),
          orderId: orderId(o.id),
          status: step.status,
          fromStatus: index > 0 ? o.history[index - 1]!.status : null,
          note: step.note ?? null,
          // La commande est passée par le client ; les étapes suivantes sont celles de l'équipe
          actor: index === 0 ? ('customer' as const) : ('staff' as const),
          createdAt: step.at,
        })),
      ),
      skipDuplicates: true,
    });

    await prisma.cancellationRequest.createMany({
      data: orders.flatMap((o) => {
        const request = o.cancellationRequest;
        if (!request) return [];
        const decidedAt =
          request.status === 'pending'
            ? null
            : (o.history.find((h) => h.status === 'cancelled')?.at ?? request.createdAt);
        return [
          {
            id: legacyUuid('cancellation', o.id),
            orderId: orderId(o.id),
            reason: request.reason,
            comment: request.comment,
            status: request.status,
            decidedAt,
            createdAt: request.createdAt,
          },
        ];
      }),
      skipDuplicates: true,
    });

    const returns = orders.flatMap((o) => (o.returnRequest ? [{ order: o, request: o.returnRequest }] : []));
    await prisma.returnRequest.createMany({
      data: returns.map(({ order, request }) => ({
        id: legacyUuid('return', order.id),
        orderId: orderId(order.id),
        status: request.status,
        reason: request.reason,
        comment: request.comment,
        evidenceUrls: [],
        createdAt: request.createdAt,
      })),
      skipDuplicates: true,
    });
    await prisma.returnItem.createMany({
      data: returns.flatMap(({ order, request }) =>
        request.items.map((item) => ({
          id: legacyUuid('return-item', `${order.id}:${item.variantId}`),
          returnId: legacyUuid('return', order.id),
          variantId: variantId(item.variantId),
          quantity: item.quantity,
        })),
      ),
      skipDuplicates: true,
    });
    await prisma.returnEvent.createMany({
      data: returns.map(({ order, request }) => ({
        id: legacyUuid('return-event', order.id),
        returnId: legacyUuid('return', order.id),
        status: request.status,
        actor: 'customer' as const,
        createdAt: request.createdAt,
      })),
      skipDuplicates: true,
    });

    await prisma.payment.createMany({
      data: orders
        .filter((o) => PAID.includes(o.paymentStatus) && o.totals.total > 0)
        .flatMap((o) => {
          const payment = {
            id: legacyUuid('payment', o.id),
            orderId: orderId(o.id),
            kind: 'payment' as const,
            amount: o.totals.total,
            method: o.paymentMethod,
            occurredAt: paidAt(o),
            staffId: owner,
          };
          if (o.paymentStatus !== 'refunded') return [payment];
          const refundedAt = o.history[o.history.length - 1]!.at;
          return [
            payment,
            {
              ...payment,
              id: legacyUuid('refund', o.id),
              kind: 'refund' as const,
              occurredAt: refundedAt > payment.occurredAt ? refundedAt : payment.occurredAt,
              noReferenceReason: 'Remboursement repris des données de démonstration',
            },
          ];
        }),
      skipDuplicates: true,
    });
    return count;
  },
};
