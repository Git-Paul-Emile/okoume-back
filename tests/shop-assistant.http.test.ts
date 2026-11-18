import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from './factories.js';

function shop() {
  const app = buildApp();
  const { catalog } = app.services;
  const category = catalog.addCategory({ slug: 'pagnes', name: 'Pagnes' });
  catalog.addZone();
  catalog.addProduct({ slug: 'pagne-wax', name: 'Pagne wax', categoryId: category.id }, [{ price: 10_000, stock: 2 }]);
  return app;
}

describe('assistant d’achat public', () => {
  it('répond à partir des données réelles de la boutique', async () => {
    const app = shop();
    app.services.shopAssistantFake.reply = { reply: 'Je vous conseille ce pagne.', productSlugs: ['pagne-wax'] };
    const res = await request(app)
      .post('/api/v1/assistant/messages')
      .send({ message: 'Un pagne pour un mariage ?', history: [] })
      .expect(200);
    expect(res.body.data).toEqual({ reply: 'Je vous conseille ce pagne.', productSlugs: ['pagne-wax'] });
    const sent = app.services.shopAssistantFake.requests[0]!;
    expect(sent.question).toBe('Un pagne pour un mariage ?');
    expect(sent.context).toContain('Pagne wax [pagne-wax]');
    expect(sent.context).toContain('Tous les paiements se font à la livraison');
  });

  it('écarte les produits inventés par le modèle', async () => {
    const app = shop();
    app.services.shopAssistantFake.reply = { reply: 'Voici.', productSlugs: ['pagne-wax', 'produit-imaginaire'] };
    const res = await request(app).post('/api/v1/assistant/messages').send({ message: 'Des idées ?' }).expect(200);
    expect(res.body.data.productSlugs).toEqual(['pagne-wax']);
  });

  it('répond 503 quand l’IA est injoignable, pour que le site prenne le relais', async () => {
    const app = shop();
    app.services.shopAssistantFake.reply = 'down';
    await request(app).post('/api/v1/assistant/messages').send({ message: 'Bonjour' }).expect(503);
  });

  it('refuse un message vide avec un message clair', async () => {
    const res = await request(shop()).post('/api/v1/assistant/messages').send({ message: '' }).expect(400);
    expect(JSON.stringify(res.body)).not.toContain('Invalid input');
  });
});
