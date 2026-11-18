import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock, deliverOrder } from '../../../tests/factories.js';
import { createFakeEmailSender } from '../../infrastructure/email/fakeEmailSender.js';

const ordersManager = { id: 's1', role: 'orders_manager' as const, extraRoles: [], customPermissions: [] };
const catalogManager = { id: 's2', role: 'catalog_manager' as const, extraRoles: [], customPermissions: [] };
const cashier = { ...ordersManager, refundLimit: 100_000 };

async function setup() {
  const clock = createClock();
  const email = createFakeEmailSender();
  const shop = buildShopServices(clock, email);
  const category = shop.catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const zone = shop.catalog.addZone({ fee: 2_000 });
  await shop.staffZones.update(zone.id, { courierCost: 1_500 }, ordersManager);
  const product = shop.catalog.addProduct({ slug: 'pagne', name: 'Pagne', categoryId: category.id }, [
    { price: 10_000, stock: 20 },
  ]);
  const { order } = await shop.orders.place(
    {
      idempotencyKey: randomUUID(),
      lines: [{ variantId: product.variants[0]!.id, quantity: 1 }],
      delivery: {
        recipient: 'Awa Ndong',
        phone: '077123456',
        email: 'awa@example.ga',
        zoneId: zone.id,
        landmark: 'Face à la pharmacie',
      },
      paymentMethod: 'cash',
    },
    'client-a',
  );
  const courier = await shop.staffCouriers.create(
    {
      firstName: 'Junior',
      lastName: 'Mba',
      phone: '074123456',
      email: 'junior.mba@example.ga',
      vehicle: 'moto',
      active: true,
      notes: '',
      zoneIds: [zone.id],
    },
    ordersManager,
  );
  const toReady = async () => {
    await shop.staffOrders.transition(order.id, { action: 'advance' }, ordersManager);
    await shop.staffOrders.transition(order.id, { action: 'advance' }, ordersManager);
  };
  return { ...shop, clock, email, order, courier, zone, toReady };
}

describe('répertoire des livreurs', () => {
  it('filtre par zone et réserve l’écriture aux personnes autorisées aux commandes', async () => {
    const { staffCouriers, zone, courier } = await setup();
    expect(await staffCouriers.list({ zoneId: zone.id }, ordersManager)).toEqual([courier]);
    await expect(
      staffCouriers.update(courier.id, { notes: 'Disponible le soir' }, catalogManager),
    ).rejects.toMatchObject({ status: 403 });
    const inactive = await staffCouriers.update(courier.id, { active: false }, ordersManager);
    expect(inactive.active).toBe(false);
    expect(await staffCouriers.list({ active: true }, ordersManager)).toEqual([]);
  });
});

describe('affectation et déroulement', () => {
  it('affecte un livreur avec le coût habituel de la zone et le prévient par e-mail', async () => {
    const { staffOrders, order, courier, toReady, email } = await setup();
    await toReady();
    const assigned = await staffOrders.transition(
      order.id,
      { action: 'assign_courier', courierId: courier.id },
      ordersManager,
    );
    expect(assigned).toMatchObject({ status: 'courier_assigned', courierId: courier.id, deliveryCost: 1_500 });
    expect(email.last('junior.mba@example.ga')?.text).toContain('À encaisser : 12 000 FCFA');
  });

  it('prévient le client au départ du colis, avec le contact du livreur', async () => {
    const { staffOrders, order, courier, toReady, email } = await setup();
    await toReady();
    await staffOrders.transition(order.id, { action: 'assign_courier', courierId: courier.id }, ordersManager);
    await staffOrders.transition(order.id, { action: 'advance' }, ordersManager);
    expect(email.last('awa@example.ga')?.text).toContain('Junior Mba, 074123456');
  });

  it('refuse un livreur désactivé et libère le livreur après un échec de livraison', async () => {
    const { staffOrders, staffCouriers, order, courier, toReady } = await setup();
    await toReady();
    await staffCouriers.update(courier.id, { active: false }, ordersManager);
    await expect(
      staffOrders.transition(order.id, { action: 'assign_courier', courierId: courier.id }, ordersManager),
    ).rejects.toMatchObject({ status: 422 });
    await staffCouriers.update(courier.id, { active: true }, ordersManager);
    await staffOrders.transition(
      order.id,
      { action: 'assign_courier', courierId: courier.id, deliveryCost: 2_500 },
      ordersManager,
    );
    const retried = await staffOrders.transition(
      order.id,
      { action: 'delivery_failed', reason: 'Client absent ou injoignable', decision: 'retry' },
      ordersManager,
    );
    expect(retried).toMatchObject({ status: 'ready', courierId: null, deliveryCost: 2_500 });
  });

  it('enregistre le coût réel de la course, distinct des frais facturés', async () => {
    const { staffOrders, order } = await setup();
    const updated = await staffOrders.setDeliveryCost(order.id, 1_800, ordersManager);
    expect(updated).toMatchObject({ deliveryCost: 1_800, totals: { deliveryFee: 2_000 } });
  });
});

describe('changement des frais facturés', () => {
  it('attend l’accord du client avant de poursuivre, puis applique les nouveaux frais', async () => {
    const { staffOrders, orders, order, courier, toReady } = await setup();
    await toReady();
    await staffOrders.proposeFeeChange(
      order.id,
      { toFee: 3_000, reason: 'Accès difficile en saison des pluies' },
      ordersManager,
    );
    await expect(
      staffOrders.proposeFeeChange(order.id, { toFee: 3_500, reason: 'Autre estimation' }, ordersManager),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      staffOrders.transition(order.id, { action: 'assign_courier', courierId: courier.id }, ordersManager),
    ).rejects.toMatchObject({ status: 409 });
    await expect(orders.decideFeeChange('client-b', order.id, true)).rejects.toMatchObject({ status: 404 });
    const accepted = await orders.decideFeeChange('client-a', order.id, true);
    expect(accepted).toMatchObject({
      totals: { deliveryFee: 3_000, total: 13_000 },
      deliveryFeeChange: { status: 'accepted' },
    });
    await expect(
      staffOrders.transition(order.id, { action: 'assign_courier', courierId: courier.id }, ordersManager),
    ).resolves.toMatchObject({ status: 'courier_assigned' });
  });

  it('laisse les frais inchangés si le client refuse, et n’en propose plus après encaissement', async () => {
    const { staffOrders, staffPayments, orders, order, clock } = await setup();
    await staffOrders.proposeFeeChange(
      order.id,
      { toFee: 1_000, reason: 'Livreur déjà dans le quartier' },
      ordersManager,
    );
    const refused = await orders.decideFeeChange('client-a', order.id, false);
    expect(refused).toMatchObject({
      totals: { deliveryFee: 2_000, total: 12_000 },
      deliveryFeeChange: { status: 'refused' },
    });
    await staffPayments.record(order.id, { amount: 12_000, receivedAt: clock.now(), reference: null }, cashier);
    await expect(
      staffOrders.proposeFeeChange(order.id, { toFee: 3_000, reason: 'Accès difficile' }, ordersManager),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('contestation d’une livraison', () => {
  it('ouvre une réclamation sans effacer « Livrée », puis la résout', async () => {
    const shop = await setup();
    const { orders, staffOrders, order } = shop;
    await expect(orders.disputeDelivery('client-a', order.id, 'Je n’ai jamais reçu le colis')).rejects.toMatchObject({
      status: 409,
    });
    await deliverOrder(shop, order.id, ordersManager);
    const disputed = await orders.disputeDelivery('client-a', order.id, 'Je n’ai jamais reçu le colis');
    expect(disputed).toMatchObject({ status: 'delivered', deliveryDispute: { status: 'open' } });
    await expect(orders.disputeDelivery('client-a', order.id, 'Toujours rien reçu à ce jour')).rejects.toMatchObject({
      status: 409,
    });
    const resolved = await staffOrders.resolveDispute(
      order.id,
      'Colis retrouvé chez la voisine, remis au client',
      ordersManager,
    );
    expect(resolved).toMatchObject({ status: 'delivered', deliveryDispute: { status: 'resolved' } });
  });
});
