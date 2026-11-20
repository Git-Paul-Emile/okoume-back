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

  it('réserve l’espace vendeur aux comptes connectés : produits, commandes, livraison, reversements', async () => {
    const agent = request(buildApp());
    for (const path of [
      '/seller/products',
      '/seller/orders',
      '/seller/delivery',
      '/seller/payouts',
      '/seller/dashboard',
    ])
      expect([401, 403]).toContain((await agent.get('/api/v1' + path)).status);
  });

  it('réserve les reversements et la vérification des produits à l’équipe', async () => {
    const agent = request(buildApp());
    expect([401, 403]).toContain((await agent.get('/api/v1/staff/payouts')).status);
    expect([401, 403]).toContain(
      (await agent.put('/api/v1/staff/products/00000000-0000-4000-8000-000000000000/moderation').send({})).status,
    );
  });

  it('n’expose plus les annonces, les demandes de commande ni le tchat', async () => {
    const agent = request(buildApp());
    for (const path of ['/listings', '/listing-requests', '/conversations', '/boost-plans'])
      expect((await agent.get('/api/v1' + path)).status).toBe(404);
  });
});
