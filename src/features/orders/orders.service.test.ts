import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock } from '../../../tests/factories.js';
import { createFakeEmailSender } from '../../infrastructure/email/fakeEmailSender.js';
import { ACCOUNT_HISTORY_MS } from './orders.service.js';
import type { CreateOrderInput } from './orders.schemas.js';

function setup() {
  const clock = createClock();
  const email = createFakeEmailSender();
  const shop = buildShopServices(clock, email);
  const category = shop.catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const zone = shop.catalog.addZone({ fee: 2_000 });
  const product = shop.catalog.addProduct({ slug: 'pagne-wax', name: 'Pagne wax', categoryId: category.id }, [
    { price: 10_000, stock: 5, label: '6 yards' },
    { price: 15_000, stock: 1, label: '12 yards' },
  ]);
  const [small, large] = product.variants as [(typeof product.variants)[0], (typeof product.variants)[0]];
  const input = (lines: CreateOrderInput['lines'], key = randomUUID()): CreateOrderInput => ({
    idempotencyKey: key,
    lines,
    delivery: {
      recipient: 'Awa Ndong',
      phone: '077123456',
      email: 'awa@example.ga',
      zoneId: zone.id,
      landmark: 'Face à la pharmacie',
    },
    paymentMethod: 'cash',
  });
  return { ...shop, clock, email, product, small, large, zone, input };
}

describe('passage de commande', () => {
  it('calcule prix et frais depuis la base, et réserve le stock', async () => {
    const { orders, small, input } = setup();
    const { order, created } = await orders.place(input([{ variantId: small.id, quantity: 2 }]), null);
    expect(created).toBe(true);
    expect(order.totals).toMatchObject({ subtotal: 20_000, deliveryFee: 2_000, total: 22_000, productDiscount: 0 });
    expect(order.items[0]).toMatchObject({ unitPrice: 10_000, originalPrice: 10_000, quantity: 2, vatRate: 18 });
    expect(order.number).toMatch(/^CMD-2026-[A-Z2-9]{6}$/);
    expect(order.paymentStatus).toBe('awaiting_payment');
    expect(small.reserved).toBe(2);
  });

  it('applique la promotion en vigueur et note la remise produit', async () => {
    const { orders, product, small, input, clock } = setup();
    product.promotion = {
      type: 'percent',
      value: 20,
      startsAt: new Date(clock.now().getTime() - 1_000),
      endsAt: new Date(clock.now().getTime() + 60_000),
    };
    const { order } = await orders.place(input([{ variantId: small.id, quantity: 1 }]), null);
    expect(order.items[0]).toMatchObject({ unitPrice: 8_000, originalPrice: 10_000 });
    expect(order.totals).toMatchObject({ subtotal: 8_000, productDiscount: 2_000, total: 10_000 });
  });

  it('renvoie la même commande pour la même clé, sans réserver ni écrire deux fois', async () => {
    const { orders, small, input, email, catalog } = setup();
    const request = input([{ variantId: small.id, quantity: 1 }]);
    const first = await orders.place(request, null);
    const second = await orders.place(request, null);
    expect(second.created).toBe(false);
    expect(second.order.id).toBe(first.order.id);
    expect(catalog.orders).toHaveLength(1);
    expect(small.reserved).toBe(1);
    expect(email.sent).toHaveLength(1);
  });

  it('refuse qu’un autre client rejoue la clé d’une commande', async () => {
    const { orders, small, input } = setup();
    const request = input([{ variantId: small.id, quantity: 1 }]);
    await orders.place(request, 'client-a');
    await expect(orders.place(request, 'client-b')).rejects.toMatchObject({ status: 409 });
  });

  it('refuse tout si un article manque, sans rien réserver', async () => {
    const { orders, small, large, input, catalog } = setup();
    const error = await orders
      .place(
        input([
          { variantId: small.id, quantity: 1 },
          { variantId: large.id, quantity: 2 },
        ]),
        null,
      )
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 409, code: 'OUT_OF_STOCK' });
    expect(small.reserved).toBe(0);
    expect(large.reserved).toBe(0);
    expect(catalog.orders).toHaveLength(0);
  });

  it('regroupe deux lignes sur la même variante', async () => {
    const { orders, small, input } = setup();
    const { order } = await orders.place(
      input([
        { variantId: small.id, quantity: 1 },
        { variantId: small.id, quantity: 2 },
      ]),
      null,
    );
    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.quantity).toBe(3);
  });

  it('refuse un article retiré de la vente ou une zone fermée', async () => {
    const { orders, product, small, input, zone } = setup();
    product.status = 'archived';
    await expect(orders.place(input([{ variantId: small.id, quantity: 1 }]), null)).rejects.toMatchObject({
      status: 422,
    });
    product.status = 'published';
    zone.available = false;
    await expect(orders.place(input([{ variantId: small.id, quantity: 1 }]), null)).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe('commandes du compte', () => {
  it('montre seulement les commandes du client sur les 3 dernières années', async () => {
    const { orders, small, input, clock } = setup();
    const old = await orders.place(input([{ variantId: small.id, quantity: 1 }]), 'client-a');
    clock.advance(ACCOUNT_HISTORY_MS + 1);
    const recent = await orders.place(input([{ variantId: small.id, quantity: 1 }]), 'client-a');
    await orders.place(input([{ variantId: small.id, quantity: 1 }]), 'client-b');

    const page = await orders.listForCustomer('client-a', { page: 1, limit: 10 });
    expect(page.items.map((o) => o.id)).toEqual([recent.order.id]);
    await expect(orders.getForCustomer('client-a', old.order.id)).rejects.toMatchObject({ status: 404 });
  });

  it('retrouve une commande du client par son numéro, jamais celle d’un autre', async () => {
    const { orders, small, input } = setup();
    const mine = await orders.place(input([{ variantId: small.id, quantity: 1 }]), 'client-a');
    await orders.place(input([{ variantId: small.id, quantity: 1 }]), 'client-a');
    const other = await orders.place(input([{ variantId: small.id, quantity: 1 }]), 'client-b');

    const found = await orders.listForCustomer('client-a', { page: 1, limit: 10, number: mine.order.number });
    expect(found.items.map((o) => o.id)).toEqual([mine.order.id]);
    const foreign = await orders.listForCustomer('client-a', { page: 1, limit: 10, number: other.order.number });
    expect(foreign.total).toBe(0);
  });

  it('répond 404 pour la commande d’un autre client', async () => {
    const { orders, small, input } = setup();
    const { order } = await orders.place(input([{ variantId: small.id, quantity: 1 }]), 'client-a');
    await expect(orders.getForCustomer('client-b', order.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('rattachement d’une commande passée sans compte', () => {
  it('rattache la commande au compte de même adresse, avec le bon code de suivi', async () => {
    const shop = setup();
    const { order } = await shop.orders.place(shop.input([{ variantId: shop.small.id, quantity: 1 }]), null);
    shop.accountEmails.set('client-a', 'AWA@example.ga');

    await expect(shop.orders.claim('client-a', order.number, 'MAUVAIS')).rejects.toMatchObject({ status: 404 });
    const claimed = await shop.orders.claim('client-a', order.number, order.trackingCode);
    expect(claimed.number).toBe(order.number);
    expect((await shop.orders.listForCustomer('client-a', { page: 1, limit: 10 })).total).toBe(1);
    await expect(shop.orders.claim('client-a', order.number, order.trackingCode)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('refuse une autre adresse e-mail et une commande déjà rattachée à un autre compte', async () => {
    const shop = setup();
    const { order } = await shop.orders.place(shop.input([{ variantId: shop.small.id, quantity: 1 }]), null);
    shop.accountEmails.set('client-b', 'autre@example.ga');
    await expect(shop.orders.claim('client-b', order.number, order.trackingCode)).rejects.toMatchObject({
      status: 422,
    });

    const owned = await shop.orders.place(shop.input([{ variantId: shop.small.id, quantity: 1 }]), 'client-a');
    shop.accountEmails.set('client-c', 'awa@example.ga');
    await expect(shop.orders.claim('client-c', owned.order.number, owned.order.trackingCode)).rejects.toMatchObject({
      status: 404,
    });
  });
});
