import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildShopServices } from '../../../tests/factories.js';
import { ForbiddenError } from '../../core/errors/AppError.js';
import { listStaffOrdersQuery } from './staff-orders.schemas.js';
import type { StaffActor } from './staff-orders.service.js';

const ordersManager: StaffActor = { id: 's1', role: 'orders_manager', extraRoles: [], customPermissions: [] };
const catalogManager: StaffActor = { id: 's2', role: 'catalog_manager', extraRoles: [], customPermissions: [] };

async function withOrder(quantity = 2) {
  const shop = buildShopServices();
  const category = shop.catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const zone = shop.catalog.addZone();
  const product = shop.catalog.addProduct({ slug: 'pagne', name: 'Pagne', categoryId: category.id }, [
    { price: 10_000, stock: 5 },
  ]);
  const variant = product.variants[0]!;
  const { order } = await shop.orders.place(
    {
      idempotencyKey: randomUUID(),
      lines: [{ variantId: variant.id, quantity }],
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
  return { ...shop, variant, order };
}

describe('commandes côté équipe', () => {
  it('refuse la liste à un rôle sans droit sur les commandes, même sans passer par la route', async () => {
    const { staffOrders } = await withOrder(1);
    await expect(staffOrders.list(listStaffOrdersQuery.parse({}), catalogManager)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect((await staffOrders.list(listStaffOrdersQuery.parse({}), ordersManager)).total).toBe(1);
  });

  it('sort le stock physique au début de la préparation, sans double déduction', async () => {
    const { staffOrders, order, variant, catalog } = await withOrder(2);
    expect(variant).toMatchObject({ stock: 5, reserved: 2 });
    const updated = await staffOrders.transition(order.id, { action: 'advance' }, ordersManager);
    expect(updated.status).toBe('preparing');
    expect(variant).toMatchObject({ stock: 3, reserved: 0 });
    expect(catalog.movements).toEqual([{ variantId: variant.id, type: 'commande', delta: -2 }]);
    expect(updated.history.at(-1)).toMatchObject({ status: 'preparing', from: 'confirmed', actor: 'staff' });
  });

  it('remet en stock une commande annulée après préparation', async () => {
    const { staffOrders, order, variant } = await withOrder(2);
    await staffOrders.transition(order.id, { action: 'advance' }, ordersManager);
    const cancelled = await staffOrders.transition(
      order.id,
      { action: 'cancel', reason: 'Rupture fournisseur' },
      ordersManager,
    );
    expect(cancelled.status).toBe('cancelled');
    expect(variant).toMatchObject({ stock: 5, reserved: 0 });
  });

  it('libère la réservation d’une commande annulée avant préparation', async () => {
    const { staffOrders, order, variant } = await withOrder(2);
    await staffOrders.transition(order.id, { action: 'cancel', reason: 'Doublon de commande' }, ordersManager);
    expect(variant).toMatchObject({ stock: 5, reserved: 0 });
  });

  it('refuse une action sans le droit correspondant', async () => {
    const { staffOrders, order } = await withOrder();
    await expect(staffOrders.transition(order.id, { action: 'advance' }, catalogManager)).rejects.toMatchObject({
      status: 403,
    });
    // Un rôle personnalisé qui accorde commandes:modifier suffit, sans le rôle de gestionnaire de commandes
    const custom: StaffActor = { ...catalogManager, customPermissions: ['commandes:modifier'] };
    await expect(staffOrders.transition(order.id, { action: 'advance' }, custom)).resolves.toMatchObject({
      status: 'preparing',
    });
  });

  it('signale une commande modifiée entre la lecture et l’écriture', async () => {
    const { staffOrders, order, catalog } = await withOrder();
    const stored = catalog.orders.find((o) => o.id === order.id)!;
    const repository = catalog.repositories.ordersRepository;
    const snapshot = { ...stored };
    await staffOrders.transition(order.id, { action: 'advance' }, ordersManager);
    const result = await repository.applyTransition(
      snapshot,
      { from: 'confirmed', to: 'preparing', stock: 'consume' },
      {
        type: 'system',
      },
    );
    expect(result.outcome).toBe('stale');
  });
});

describe('annulation par le client', () => {
  it('annule tout de suite une commande seulement confirmée', async () => {
    const { orders, order, variant } = await withOrder(2);
    const { order: cancelled, direct } = await orders.cancelOwn('client-a', order.id, {
      reason: 'Changement d’avis',
      comment: '',
    });
    expect(direct).toBe(true);
    expect(cancelled.status).toBe('cancelled');
    expect(variant.reserved).toBe(0);
  });

  it('transforme l’annulation en demande après le début de la préparation, tranchée par l’équipe', async () => {
    const { orders, staffOrders, order, variant } = await withOrder(2);
    await staffOrders.transition(order.id, { action: 'advance' }, ordersManager);
    const { order: pending, direct } = await orders.cancelOwn('client-a', order.id, {
      reason: 'Retard de livraison',
      comment: 'Trop long',
    });
    expect(direct).toBe(false);
    expect(pending).toMatchObject({ status: 'preparing', cancellationRequest: { status: 'pending' } });
    await expect(orders.cancelOwn('client-a', order.id, { reason: 'Autre motif', comment: '' })).rejects.toMatchObject({
      status: 409,
    });

    const decided = await staffOrders.decideCancellation(
      order.id,
      { status: 'accepted', decisionReason: 'Accepté, remboursement à suivre' },
      ordersManager,
    );
    expect(decided).toMatchObject({ status: 'cancelled', cancellationRequest: { status: 'accepted' } });
    expect(variant).toMatchObject({ stock: 5, reserved: 0 });
  });

  it('laisse la commande en cours quand la demande est refusée', async () => {
    const { orders, staffOrders, order } = await withOrder();
    await staffOrders.transition(order.id, { action: 'advance' }, ordersManager);
    await orders.cancelOwn('client-a', order.id, { reason: 'Changement d’avis', comment: '' });
    const decided = await staffOrders.decideCancellation(
      order.id,
      { status: 'refused', decisionReason: 'Colis déjà remis au livreur' },
      ordersManager,
    );
    expect(decided).toMatchObject({ status: 'preparing', cancellationRequest: { status: 'refused' } });
  });

  it('refuse l’annulation de la commande d’un autre client', async () => {
    const { orders, order } = await withOrder();
    await expect(
      orders.cancelOwn('client-b', order.id, { reason: 'Changement d’avis', comment: '' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('suivi sans compte', () => {
  it('donne l’avancement avec le bon code, sans les coordonnées du client', async () => {
    const { orders, order } = await withOrder();
    const tracked = await orders.track(order.number.toLowerCase(), order.trackingCode.toLowerCase());
    expect(tracked).toMatchObject({ number: order.number, status: 'confirmed', zoneName: 'Glass' });
    expect(tracked).not.toHaveProperty('customer');
    expect(tracked).not.toHaveProperty('trackingCode');
  });

  it('répond pareil pour un numéro inconnu et un mauvais code', async () => {
    const { orders, order } = await withOrder();
    const unknown = await orders.track('CMD-2026-ZZZZZZ', order.trackingCode).catch((e: Error) => e);
    const wrong = await orders.track(order.number, 'ZZZZZZ').catch((e: Error) => e);
    expect(unknown).toMatchObject({ status: 404 });
    expect(wrong).toMatchObject({ status: 404, message: (unknown as Error).message });
  });
});

describe('stock manuel', () => {
  it('ajoute une réception et fixe un inventaire, jamais sous les réservations', async () => {
    const { staffStock, variant } = await withOrder(2);
    const stockManager = { id: 's3', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };
    const received = await staffStock.move(
      variant.id,
      { type: 'reception', quantity: 10, reason: 'Livraison fournisseur' },
      stockManager,
    );
    expect(received).toMatchObject({ movement: { before: 5, after: 15, delta: 10 }, available: 13 });
    await expect(
      staffStock.move(variant.id, { type: 'ajustement', counted: 1, reason: 'Inventaire' }, stockManager),
    ).rejects.toMatchObject({ status: 409 });
    const counted = await staffStock.move(
      variant.id,
      { type: 'ajustement', counted: 4, reason: 'Inventaire' },
      stockManager,
    );
    expect(counted).toMatchObject({ movement: { before: 15, after: 4, delta: -11 }, available: 2 });
    const history = await staffStock.history(variant.id, { page: 1, limit: 10 });
    expect(history.items.map((m) => m.type)).toEqual(['ajustement', 'reception']);
  });

  it('réserve la réception aux personnes autorisées au stock', async () => {
    const { staffStock, variant } = await withOrder();
    await expect(
      staffStock.move(variant.id, { type: 'reception', quantity: 1, reason: 'Livraison' }, ordersManager),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('commandes suspectes', () => {
  it('met une commande au montant élevé à vérifier, bloque la préparation puis la libère après vérification', async () => {
    const shop = buildShopServices();
    shop.catalog.reviewAmount.value = 15_000;
    const category = shop.catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
    const zone = shop.catalog.addZone();
    const product = shop.catalog.addProduct({ slug: 'pagne', name: 'Pagne', categoryId: category.id }, [
      { price: 10_000, stock: 5 },
    ]);
    const { order } = await shop.orders.place(
      {
        idempotencyKey: randomUUID(),
        lines: [{ variantId: product.variants[0]!.id, quantity: 2 }],
        delivery: { recipient: 'Awa', phone: '077123456', email: 'awa@example.ga', zoneId: zone.id, landmark: 'Face' },
        paymentMethod: 'cash',
      },
      'client-a',
    );
    // Le client ne voit jamais les motifs
    expect(order).not.toHaveProperty('review');

    const staffView = await shop.staffOrders.get(order.id);
    expect(staffView.review).toMatchObject({ status: 'pending', reasons: ['Montant élevé'] });
    const pending = await shop.staffOrders.list(listStaffOrdersQuery.parse({ review: 'pending' }), ordersManager);
    expect(pending.items.map((o) => o.id)).toEqual([order.id]);

    await expect(shop.staffOrders.transition(order.id, { action: 'advance' }, ordersManager)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      shop.staffOrders.clearReview(order.id, 'Client rappelé, commande confirmée', catalogManager),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const cleared = await shop.staffOrders.clearReview(order.id, 'Client rappelé, commande confirmée', ordersManager);
    expect(cleared.review).toMatchObject({ status: 'cleared', note: 'Client rappelé, commande confirmée' });
    expect((await shop.staffOrders.transition(order.id, { action: 'advance' }, ordersManager)).status).toBe(
      'preparing',
    );
  });

  it('laisse passer une commande ordinaire sans vérification', async () => {
    const { staffOrders, order } = await withOrder(1);
    expect((await staffOrders.get(order.id)).review).toBeNull();
    expect((await staffOrders.transition(order.id, { action: 'advance' }, ordersManager)).status).toBe('preparing');
  });
});
