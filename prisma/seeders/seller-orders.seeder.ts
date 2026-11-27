import { z } from 'zod';
import { customerId, loadCustomers } from './customers.seeder.js';
import { loadZones, zoneId } from './delivery-zones.seeder.js';
import { loadSellerProducts, productId, variantId } from './products.seeder.js';
import { ownerStaffId } from './staff.seeder.js';
import { shopId } from './shops.seeder.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const orderStatus = z.enum(['confirmed', 'preparing', 'ready', 'courier_assigned', 'shipping', 'delivered']);

const schema = z.array(
  z.object({
    id: z.string(),
    number: z.string().min(1),
    trackingCode: z.string().min(1),
    checkoutNumber: z.string().min(1),
    customerId: z.string(),
    shopId: z.string(),
    productId: z.string(),
    variantId: z.string(),
    quantity: z.number().int().positive(),
    zoneId: z.string(),
    deliveryFee: z.number().int().min(0),
    deliveryCost: z.number().int().min(0).nullable(),
    paymentMethod: z.enum(['cash', 'airtel', 'moov']),
    paymentStatus: z.enum(['awaiting_payment', 'paid']),
    status: orderStatus,
    fulfilledBy: z.enum(['okoza', 'seller']),
    payoutStatus: z.enum(['pending', 'paid']).optional(),
    createdAt: isoDate,
    history: z.array(z.object({ status: orderStatus, at: isoDate, note: z.string().optional() })).min(1),
  }),
);

export const loadSellerOrders = () => readData('seller-orders.json', schema);

/** Commandes de démonstration du parcours vendeur et reversements simples. */
export const sellerOrdersSeeder: Seeder = {
  name: 'seller-orders',
  demo: true,
  async run({ prisma }) {
    const orders = loadSellerOrders();
    const customers = new Map(loadCustomers().map((customer) => [customer.id, customer]));
    const zones = new Map(loadZones().map((zone) => [zone.id, zone]));
    const products = new Map(loadSellerProducts().map((product) => [product.id, product]));
    const staffId = ownerStaffId();

    const snapshots = orders.map((order) => {
      const customer = customers.get(order.customerId);
      const zone = zones.get(order.zoneId);
      const product = products.get(order.productId);
      const variant = product?.variants.find((candidate) => candidate.id === order.variantId);
      if (!customer || !zone || !product || !variant)
        throw new Error(`seller-orders.json : relation absente pour ${order.id}`);
      const subtotal = variant.price * order.quantity;
      const total = subtotal + order.deliveryFee;
      const phone = customer.phone ?? '+241 060000000';
      return { order, customer, zone, product, variant, phone, subtotal, total };
    });

    const { count } = await prisma.order.createMany({
      data: snapshots.map(({ order, customer, zone, phone, subtotal, total }) => ({
        id: legacyUuid('order', order.id),
        number: order.number,
        trackingCode: order.trackingCode,
        customerId: customerId(customer.id),
        idempotencyKey: `seed:${order.id}`,
        recipient: `${customer.firstName} ${customer.lastName}`,
        phone,
        email: customer.email,
        zoneId: zoneId(zone.id),
        zoneName: zone.name,
        landmark: `Adresse de démonstration, ${zone.city}`,
        subtotal,
        productDiscount: 0,
        codeDiscount: 0,
        deliveryFee: order.deliveryFee,
        deliveryDiscount: 0,
        total,
        deliveryCost: order.deliveryCost,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        status: order.status,
        shopId: shopId(order.shopId),
        checkoutNumber: order.checkoutNumber,
        fulfilledBy: order.fulfilledBy,
        createdAt: order.createdAt,
      })),
      skipDuplicates: true,
    });

    await prisma.orderItem.createMany({
      data: snapshots.map(({ order, product, variant }) => ({
        id: legacyUuid('order-item', `${order.id}:0`),
        orderId: legacyUuid('order', order.id),
        productId: productId(product.id),
        variantId: variantId(variant.id),
        name: product.name,
        variantLabel: variant.label,
        image: product.images[0] ?? '',
        unitPrice: variant.price,
        originalPrice: variant.price,
        vatRate: 18,
        quantity: order.quantity,
      })),
      skipDuplicates: true,
    });

    await prisma.orderEvent.createMany({
      data: snapshots.flatMap(({ order }) =>
        order.history.map((step, index) => ({
          id: legacyUuid('order-event', `${order.id}:${index}`),
          orderId: legacyUuid('order', order.id),
          status: step.status,
          fromStatus: index ? order.history[index - 1]!.status : null,
          note: step.note ?? null,
          actor: index ? ('staff' as const) : ('customer' as const),
          createdAt: step.at,
        })),
      ),
      skipDuplicates: true,
    });

    await prisma.payment.createMany({
      data: snapshots.flatMap(({ order, total }) =>
        order.paymentStatus === 'paid' && total > 0
          ? [{
              id: legacyUuid('payment', order.id),
              orderId: legacyUuid('order', order.id),
              kind: 'payment' as const,
              amount: total,
              method: order.paymentMethod,
              occurredAt: (order.history.find((step) => step.status === 'delivered') ?? order.history.at(-1)!).at,
              staffId,
            }]
          : [],
      ),
      skipDuplicates: true,
    });

    const commissionRate = 0;
    await prisma.sellerPayout.createMany({
      data: snapshots.flatMap(({ order, subtotal, total }) => {
        if (!order.payoutStatus) return [];
        const commission = Math.floor((subtotal * commissionRate) / 100);
        const paidAt = order.history.find((step) => step.status === 'delivered')?.at ?? null;
        return [{
          id: legacyUuid('seller-payout', order.id),
          shopId: shopId(order.shopId),
          orderId: legacyUuid('order', order.id),
          collected: total,
          deliveryFee: order.deliveryFee,
          commissionRate,
          commission,
          amount: total - order.deliveryFee - commission,
          status: order.payoutStatus,
          method: order.payoutStatus === 'paid' ? ('cash' as const) : null,
          reference: null,
          paidAt: order.payoutStatus === 'paid' ? paidAt : null,
          paidById: order.payoutStatus === 'paid' ? staffId : null,
          createdAt: order.createdAt,
        }];
      }),
      skipDuplicates: true,
    });
    return count;
  },
};
