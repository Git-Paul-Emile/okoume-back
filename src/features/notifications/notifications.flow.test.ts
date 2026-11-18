import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildShopServices } from '../../../tests/factories.js';

const ordersManager = { id: 's1', role: 'orders_manager' as const, extraRoles: [], customPermissions: [] };

function setup() {
  const shop = buildShopServices();
  const category = shop.catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const zone = shop.catalog.addZone({ fee: 2_000 });
  const product = shop.catalog.addProduct({ slug: 'pagne', name: 'Pagne', categoryId: category.id }, [
    { price: 10_000, stock: 5 },
  ]);
  const customer = shop.catalog.addCustomer({ firstName: 'Awa', phone: '077111111' });
  const place = async (customerId: string | null) =>
    (
      await shop.orders.place(
        {
          idempotencyKey: randomUUID(),
          lines: [{ variantId: product.variants[0]!.id, quantity: 1 }],
          delivery: {
            recipient: 'Awa Ndong',
            phone: '077111111',
            email: 'awa@example.ga',
            zoneId: zone.id,
            landmark: 'Marché de Nkembo',
          },
          paymentMethod: 'cash',
        },
        customerId,
      )
    ).order;
  const pushes = () =>
    shop.pushQueue.jobs.flatMap((j) => (j.name === 'push.send' && 'audience' in j.data ? [j.data] : []));
  return { shop, customer, place, pushes };
}

describe('déclencheurs des notifications push', () => {
  it('alerte l’équipe à chaque nouvelle commande, sans les coordonnées du client', async () => {
    const { place, pushes } = setup();
    const order = await place(null);
    expect(pushes()).toEqual([
      expect.objectContaining({
        audience: { permission: 'commandes:consulter' },
        urgent: true,
        message: expect.objectContaining({ body: `Commande ${order.number} : 12 000 FCFA` }),
      }),
    ]);
    expect(JSON.stringify(pushes())).not.toMatch(/Awa|077111111|awa@example/);
  });

  it('prévient le client connecté à chaque étape suivie de sa commande', async () => {
    const { shop, customer, place, pushes } = setup();
    const order = await place(customer.id);
    await shop.staffOrders.transition(order.id, { action: 'advance' }, ordersManager);
    expect(pushes().at(-1)).toMatchObject({
      audience: { customerId: customer.id, topic: 'orders' },
      message: { title: `Commande ${order.number}`, body: 'Votre commande est en préparation.' },
    });
  });

  it('ne prévoit aucune notification client pour une commande passée sans compte', async () => {
    const { shop, place, pushes } = setup();
    const order = await place(null);
    await shop.staffOrders.transition(order.id, { action: 'advance' }, ordersManager);
    expect(pushes().filter((p) => 'customerId' in p.audience)).toEqual([]);
  });
});
