import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from './factories.js';

const PRODUCT = '22222222-2222-4222-8222-222222222222';

describe('avis HTTP', () => {
  it('lit les notes et les avis publiés sans compte, avec un cache public', async () => {
    const app = buildApp();
    const ratings = await request(app).get('/api/v1/reviews/ratings').expect(200);
    expect(ratings.headers['cache-control']).toBe('public, max-age=300');
    const page = await request(app).get(`/api/v1/reviews/products/${PRODUCT}`).expect(200);
    expect(page.body.data).toMatchObject({ items: [], total: 0 });
  });

  it('réserve le dépôt au compte et la modération à l’équipe', async () => {
    const app = buildApp();
    await request(app)
      .put(`/api/v1/reviews/mine/${PRODUCT}`)
      .send({ rating: 5, comment: 'Très bon produit.' })
      .expect(401);
    await request(app).post('/api/v1/reviews/photo-uploads').expect(401);
    await request(app).get('/api/v1/staff/reviews').expect(401);
  });
});
