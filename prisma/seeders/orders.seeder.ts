import { z } from 'zod';
import { customerId } from './customers.seeder.js';
import { zoneId } from './delivery-zones.seeder.js';
import { productId, variantId } from './products.seeder.js';
import { ownerStaffId } from './staff.seeder.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const orderStatus = z.enum(['confirmed', 'preparing', 'ready', 'courier_assigned', 'shipping', 'delivered']);
const amount = z.number().int().min(0);

const schema = z.array(
  z.object({
    id: z.string(),
    number: z.string().min(1),
    trackingCode: z.string().min(1),
    userId: z.string().nullable(),
    items: z.array(
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
    ).min(1),
    customer: z.object({
      recipient: z.string().min(1),
      phone: z.string().min(1),
      email: z.string().min(1),
      zoneId: z.string(),
      zoneName: z.string().min(1),
      landmark: z.string(),
      instructions: z.string().optional(),
    }),
    totals: z.object({
      subtotal: amount,
      productDiscount: amount,
      codeDiscount: amount,
      deliveryFee: amount,
      deliveryDiscount: amount,
      total: amount,
    }),
    deliveryCost: amount.nullable(),
    promoCode: z.string().nullable().optional(),
    paymentMethod: z.enum(['cash', 'airtel', 'moov']),
    paymentStatus: z.enum(['awaiting_payment', 'paid']),
    status: orderStatus,
    history: z.array(z.object({ status: orderStatus, at: isoDate, note: z.string().optional() })).min(1),
    createdAt: isoDate,
  }),
);

/** Commandes de démonstration du parcours client, sans annulation, retour ni remboursement. */
export const loadOrders = () => readData('orders.json', schema);

export const orderId = (legacyId: string) => legacyUuid('order', legacyId);

const paidAt = (order: z.infer<typeof schema>[number]) =>
  (order.history.find((event) => event.status === 'delivered') ?? order.history.at(-1)!).at;

export const ordersSeeder: Seeder = {
  name: 'orders',
  demo: true,
  async run({ prisma }) {
    const orders = loadOrders();
    const { count } = await prisma.order.createMany({
      data: orders.map((order) => ({
        id: orderId(order.id),
        number: order.number,
        trackingCode: order.trackingCode,
        customerId: order.userId ? customerId(order.userId) : null,
        idempotencyKey: `seed:${order.id}`,
        recipient: order.customer.recipient,
        phone: order.customer.phone,
        email: order.customer.email,
        zoneId: zoneId(order.customer.zoneId),
        zoneName: order.customer.zoneName,
        landmark: order.customer.landmark,
        instructions: order.customer.instructions ?? '',
        ...order.totals,
        promoCode: order.promoCode ?? null,
        deliveryCost: order.deliveryCost,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        status: order.status,
        createdAt: order.createdAt,
      })),
      skipDuplicates: true,
    });

    await prisma.orderItem.createMany({
      data: orders.flatMap((order) =>
        order.items.map((item, index) => ({
          id: legacyUuid('order-item', `${order.id}:${index}`),
          orderId: orderId(order.id),
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
      data: orders.flatMap((order) =>
        order.history.map((step, index) => ({
          id: legacyUuid('order-event', `${order.id}:${index}`),
          orderId: orderId(order.id),
          status: step.status,
          fromStatus: index ? order.history[index - 1]!.status : null,
          note: step.note ?? null,
          actor: index === 0 ? ('customer' as const) : ('staff' as const),
          createdAt: step.at,
        })),
      ),
      skipDuplicates: true,
    });

    const ownerId = ownerStaffId();
    await prisma.payment.createMany({
      data: orders
        .filter((order) => order.paymentStatus === 'paid' && order.totals.total > 0)
        .map((order) => ({
          id: legacyUuid('payment', order.id),
          orderId: orderId(order.id),
          kind: 'payment' as const,
          amount: order.totals.total,
          method: order.paymentMethod,
          occurredAt: paidAt(order),
          staffId: ownerId,
        })),
      skipDuplicates: true,
    });
    return count;
  },
};
