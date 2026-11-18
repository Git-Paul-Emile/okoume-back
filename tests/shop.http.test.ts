import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from './factories.js';

function shop() {
  const app = buildApp();
  const { catalog } = app.services;
  const category = catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  const zone = catalog.addZone();
  const product = catalog.addProduct({ slug: 'pagne-wax', name: 'Pagne wax', categoryId: category.id }, [
    { price: 10_000, stock: 2, reserved: 1 },
  ]);
  const variant = product.variants[0]!;
  const order = (overrides: Record<string, unknown> = {}) => ({
    idempotencyKey: randomUUID(),
    lines: [{ variantId: variant.id, quantity: 1 }],
    delivery: {
      recipient: 'Awa Ndong',
      phone: '077123456',
      email: 'awa@example.ga',
      zoneId: zone.id,
      landmark: 'Face à la pharmacie',
    },
    paymentMethod: 'cash',
    ...overrides,
  });
  return { app, variant, zone, order };
}

describe('catalogue public', () => {
  it('liste les produits publiés, paginés, sans le stock interne', async () => {
    const { app } = shop();
    const res = await request(app).get('/api/v1/products?limit=5').expect(200);
    expect(res.body.data).toMatchObject({ total: 1, page: 1, limit: 5, hasNext: false });
    const [variant] = res.body.data.items[0].variants;
    expect(variant).toMatchObject({ price: 10_000, salePrice: 10_000, available: 1, availability: 'low_stock' });
    expect(variant).not.toHaveProperty('stock');
    expect(variant).not.toHaveProperty('reserved');
    expect(res.headers['cache-control']).toContain('public');
  });

  it('affiche un produit par son adresse, 404 sinon', async () => {
    const { app } = shop();
    const res = await request(app).get('/api/v1/products/pagne-wax').expect(200);
    expect(res.body.data).toMatchObject({ slug: 'pagne-wax', rootCategoryId: res.body.data.categoryId });
    await request(app).get('/api/v1/products/inconnu').expect(404);
  });

  it('refuse un filtre inconnu ou incohérent', async () => {
    const { app } = shop();
    await request(app).get('/api/v1/products?couleur=rouge').expect(400);
    await request(app).get('/api/v1/products?minPrice=5000&maxPrice=1000').expect(400);
    await request(app).get('/api/v1/products?sort=-stock').expect(400);
  });

  it('liste catégories et zones de livraison', async () => {
    const { app } = shop();
    const categories = await request(app).get('/api/v1/categories').expect(200);
    expect(categories.body.data[0]).toMatchObject({ slug: 'pagnes', parentId: null });
    const zones = await request(app).get('/api/v1/delivery-zones').expect(200);
    expect(zones.body.data[0]).toMatchObject({ name: 'Glass', fee: 2_000 });
    expect(zones.body.data[0]).not.toHaveProperty('courierCost');
  });
});

describe('commandes HTTP', () => {
  it('crée une commande sans compte (201), puis la renvoie pour la même clé (200)', async () => {
    const { app, order } = shop();
    const body = order();
    const created = await request(app).post('/api/v1/orders').send(body).expect(201);
    expect(created.body.data).toMatchObject({
      status: 'confirmed',
      totals: { total: 12_000 },
      customer: { landmark: 'Face à la pharmacie', instructions: '' },
    });
    const replay = await request(app).post('/api/v1/orders').send(body).expect(200);
    expect(replay.body.data.id).toBe(created.body.data.id);
  });

  it('garde les consignes pour le livreur', async () => {
    const { app, order } = shop();
    const body = order();
    const created = await request(app)
      .post('/api/v1/orders')
      .send({ ...body, delivery: { ...body.delivery, instructions: 'Portail vert, sonner deux fois' } })
      .expect(201);
    expect(created.body.data.customer.instructions).toBe('Portail vert, sonner deux fois');
  });

  it('refuse un prix ou un total envoyé par le navigateur', async () => {
    const { app, order, variant } = shop();
    const tampered = order({ lines: [{ variantId: variant.id, quantity: 1, unitPrice: 1 }] });
    const res = await request(app).post('/api/v1/orders').send(tampered).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    await request(app)
      .post('/api/v1/orders')
      .send(order({ totals: { total: 1 } }))
      .expect(400);
  });

  it('signale le stock insuffisant avec le détail par article', async () => {
    const { app, order, variant } = shop();
    const res = await request(app)
      .post('/api/v1/orders')
      .send(order({ lines: [{ variantId: variant.id, quantity: 2 }] }))
      .expect(409);
    expect(res.body.code).toBe('OUT_OF_STOCK');
    expect(res.body.errors[0].message).toContain('1 disponible');
  });

  it('réserve l’historique des commandes aux clients connectés', async () => {
    const { app } = shop();
    await request(app).get('/api/v1/orders').expect(401);
    await request(app).get(`/api/v1/orders/${randomUUID()}`).expect(401);
  });
});

describe('routes de l’équipe et suivi', () => {
  it('refuse les commandes et le stock de l’équipe sans session', async () => {
    const { app, variant } = shop();
    await request(app).get('/api/v1/staff/orders').expect(401);
    await request(app).get(`/api/v1/staff/variants/${variant.id}/stock-movements`).expect(401);
  });

  it('suit une commande par numéro et code, 404 sinon', async () => {
    const { app, order } = shop();
    const created = await request(app).post('/api/v1/orders').send(order()).expect(201);
    const { number, trackingCode } = created.body.data;
    const res = await request(app).get('/api/v1/order-tracking').query({ number, code: trackingCode }).expect(200);
    expect(res.body.data).toMatchObject({ number, status: 'confirmed' });
    expect(res.body.data).not.toHaveProperty('customer');
    await request(app).get('/api/v1/order-tracking').query({ number, code: 'ZZZZZZ' }).expect(404);
  });
});

describe('catalogue de l’équipe en HTTP', () => {
  it('refuse produits, catégories et zones de l’équipe sans session', async () => {
    const { app } = shop();
    await request(app).get('/api/v1/staff/products').expect(401);
    await request(app).post('/api/v1/staff/categories').send({ name: 'X' }).expect(401);
    await request(app).get('/api/v1/staff/delivery-zones').expect(401);
  });
});

describe('paiements en HTTP', () => {
  it('exige une session pour les paiements, côté équipe comme côté client', async () => {
    const { app } = shop();
    const id = randomUUID();
    await request(app).get(`/api/v1/staff/orders/${id}/payments`).expect(401);
    await request(app).post(`/api/v1/staff/orders/${id}/refunds`).send({}).expect(401);
    await request(app).put(`/api/v1/orders/${id}/payment-method`).send({ paymentMethod: 'cash' }).expect(401);
    // Les autres routes des commandes de l'équipe restent protégées par leur propre contrôle
    await request(app).get('/api/v1/staff/orders').expect(401);
  });
});

describe('retours en HTTP', () => {
  it('exige une session pour les retours, côté client comme côté équipe', async () => {
    const { app, variant } = shop();
    const id = randomUUID();
    await request(app).get(`/api/v1/orders/${id}/return`).expect(401);
    await request(app).post(`/api/v1/orders/${id}/return`).send({}).expect(401);
    await request(app).get('/api/v1/staff/returns').expect(401);
    await request(app).post(`/api/v1/staff/variants/${variant.id}/write-offs`).send({}).expect(401);
  });
});

describe('devis, fidélité et codes en HTTP', () => {
  it('calcule un devis sans compte et protège la fidélité et les codes', async () => {
    const { app, variant, zone } = shop();
    const quote = await request(app)
      .post('/api/v1/checkout/quotes')
      .send({ lines: [{ variantId: variant.id, quantity: 1 }], zoneId: zone.id, points: 100 })
      .expect(200);
    expect(quote.body.data.totals).toMatchObject({ subtotal: 10_000, total: 12_000, pointsUsed: 0 });
    expect(quote.body.data.totals.pointsError).toContain('Connectez-vous');
    // Page panier : sans quartier choisi, la livraison n'est pas comptée
    const cart = await request(app)
      .post('/api/v1/checkout/quotes')
      .send({ lines: [{ variantId: variant.id, quantity: 2 }] })
      .expect(200);
    expect(cart.body.data).toMatchObject({ zone: null, totals: { subtotal: 20_000, deliveryFee: 0, total: 20_000 } });
    await request(app).get('/api/v1/loyalty').expect(401);
    await request(app).get('/api/v1/staff/promo-codes').expect(401);
    await request(app).patch('/api/v1/staff/settings/loyalty').send({ silverThreshold: 1 }).expect(401);
  });
});

describe('factures en HTTP', () => {
  it('exige une session pour les factures, côté client comme côté équipe', async () => {
    const { app } = shop();
    await request(app).get(`/api/v1/orders/${randomUUID()}/invoices`).expect(401);
    await request(app).get('/api/v1/staff/invoices').expect(401);
  });
});

describe('livraison en HTTP', () => {
  it('exige une session pour les livreurs, les frais et les contestations', async () => {
    const { app } = shop();
    const id = randomUUID();
    await request(app).get('/api/v1/staff/couriers').expect(401);
    await request(app).patch(`/api/v1/orders/${id}/delivery-fee-change`).send({ status: 'accepted' }).expect(401);
    await request(app).post(`/api/v1/orders/${id}/delivery-disputes`).send({ reason: 'Colis jamais reçu' }).expect(401);
  });
});

describe('récompenses en HTTP', () => {
  it('exige une session pour le parrainage, les préférences et la vérification', async () => {
    const { app } = shop();
    await request(app).get('/api/v1/loyalty/referral').expect(401);
    await request(app).put('/api/v1/loyalty/preferences').send({ birthdayChoice: 'code' }).expect(401);
    await request(app).get('/api/v1/staff/referral-rewards').expect(401);
  });
});
