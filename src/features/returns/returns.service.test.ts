import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildShopServices, createClock, deliverOrder } from '../../../tests/factories.js';
import type { ReturnActor } from '../staff-returns/staff-returns.service.js';

const ordersManager: ReturnActor = { id: 's1', role: 'orders_manager', extraRoles: [], customPermissions: [] };
const DAY = 24 * 60 * 60_000;

/** Commande de 2 pagnes du client « client-a », livrée. */
async function delivered() {
  const clock = createClock();
  const shop = buildShopServices(clock);
  const category = shop.catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const zone = shop.catalog.addZone({ fee: 2_000 });
  const product = shop.catalog.addProduct({ slug: 'pagne', name: 'Pagne', categoryId: category.id }, [
    { price: 10_000, stock: 10 },
  ]);
  const variant = product.variants[0]!;
  const { order } = await shop.orders.place(
    {
      idempotencyKey: randomUUID(),
      lines: [{ variantId: variant.id, quantity: 2 }],
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
  await deliverOrder(shop, order.id, ordersManager);
  const damaged = (evidenceUrls: string[]) =>
    shop.returns.request('client-a', order.id, {
      items: [{ variantId: variant.id, quantity: 1 }],
      reason: 'Produit endommagé',
      comment: 'Couture déchirée à la livraison.',
      evidenceUrls,
    });
  return { ...shop, clock, order, damaged };
}

describe('photos justificatives d’un retour', () => {
  it('signe un envoi vers le dossier des retours, pour une commande du client encore retournable', async () => {
    const { returns, order, clock } = await delivered();
    const upload = await returns.signEvidenceUpload('client-a', order.id);
    expect(upload.fields).toMatchObject({ folder: 'returns' });
    await expect(returns.signEvidenceUpload('client-b', order.id)).rejects.toMatchObject({ status: 404 });
    clock.advance(15 * DAY);
    await expect(returns.signEvidenceUpload('client-a', order.id)).rejects.toMatchObject({ status: 409 });
  });

  it('exige une photo pour un produit endommagé, et seulement une photo envoyée chez notre hébergeur', async () => {
    const { damaged } = await delivered();
    await expect(damaged([])).rejects.toMatchObject({ status: 422 });
    await expect(damaged(['https://ailleurs.example/photo.jpg'])).rejects.toMatchObject({
      status: 422,
      message: 'Joignez les photos depuis ce formulaire.',
    });
    const created = await damaged(['https://medias.test/returns/photo.jpg']);
    expect(created).toMatchObject({ status: 'pending', reason: 'Produit endommagé' });
  });
});
