import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from './factories.js';

describe('place de marché en HTTP', () => {
  it('publie les offres actives sans connexion, avec un cache court', async () => {
    const app = buildApp();
    await app.services.staffShops.createPlan(
      {
        name: 'Accès gratuit',
        description: '',
        kind: 'free',
        price: 0,
        periodDays: null,
        trialDays: 0,
        active: true,
        position: 0,
      },
      { role: 'super_admin', extraRoles: [], customPermissions: [] },
    );
    const res = await request(app).get('/api/v1/access-plans').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.body.data).toMatchObject([{ name: 'Accès gratuit', kind: 'free' }]);
  });

  it('exige un compte pour la boutique du vendeur et l’équipe pour l’administration', async () => {
    const agent = request(buildApp());
    expect([401, 403]).toContain((await agent.get('/api/v1/seller/shop')).status);
    expect([401, 403]).toContain((await agent.get('/api/v1/staff/shops')).status);
    expect([401, 403]).toContain((await agent.get('/api/v1/staff/shop-payments')).status);
  });

  it('répond 404 pour une boutique inconnue et 400 pour une adresse invalide', async () => {
    const agent = request(buildApp());
    await agent.get('/api/v1/shops/boutique-inconnue').expect(404);
    await agent.get('/api/v1/shops/Adresse%20Invalide').expect(400);
  });

  it('protège les routes des annonces : vendeur connecté, signalement avec compte, modération par l’équipe', async () => {
    const agent = request(buildApp());
    await agent.get('/api/v1/listings/annonce-inconnue').expect(404);
    expect([401, 403]).toContain((await agent.get('/api/v1/seller/listings')).status);
    expect([401, 403]).toContain((await agent.post('/api/v1/listings/annonce-inconnue/reports').send({})).status);
    expect([401, 403]).toContain((await agent.get('/api/v1/staff/listings')).status);
    expect([401, 403]).toContain((await agent.get('/api/v1/staff/listing-reports')).status);
    await agent.get('/api/v1/shops/boutique-inconnue/listings').expect(404);
  });

  it('recherche sans position en GET, avec position seulement en POST et jamais mise en cache', async () => {
    const agent = request(buildApp());
    const listed = await agent.get('/api/v1/listings?condition=new,good&minPrice=1000').expect(200);
    expect(listed.headers['cache-control']).toBe('public, max-age=60');
    await agent.get('/api/v1/listings?sort=distance').expect(400);
    await agent.get('/api/v1/listings?lat=0.39&lng=9.45').expect(400);
    await agent.post('/api/v1/listings/searches').send({ maxKm: 5 }).expect(400);
    const nearby = await agent
      .post('/api/v1/listings/searches')
      .send({ position: { latitude: 0.3912, longitude: 9.4531 }, maxKm: 10 })
      .expect(200);
    expect(nearby.headers['cache-control']).toBe('no-store');
    expect(nearby.body.data).toMatchObject({ items: [], total: 0 });
  });

  it('réserve les demandes de commande aux comptes connectés', async () => {
    const agent = request(buildApp());
    expect([401, 403]).toContain((await agent.post('/api/v1/listing-requests').send({})).status);
    expect([401, 403]).toContain((await agent.get('/api/v1/listing-requests')).status);
    expect([401, 403]).toContain((await agent.get('/api/v1/seller/listing-requests')).status);
  });

  it('réserve le tchat aux comptes connectés', async () => {
    const agent = request(buildApp());
    expect([401, 403]).toContain((await agent.post('/api/v1/conversations').send({ listingSlug: 'x' })).status);
    expect([401, 403]).toContain((await agent.get('/api/v1/seller/conversations')).status);
  });

  it('publie les offres de mise en avant et réserve le reste aux comptes et à l’équipe', async () => {
    const agent = request(buildApp());
    await agent.get('/api/v1/boost-plans').expect(200);
    expect([401, 403]).toContain((await agent.get('/api/v1/seller/boosts')).status);
    expect([401, 403]).toContain((await agent.get('/api/v1/staff/boosts')).status);
    expect([401, 403]).toContain((await agent.get('/api/v1/staff/boost-plans')).status);
  });
});
