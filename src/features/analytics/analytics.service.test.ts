import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../tests/factories.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const DAY = 86_400_000;

describe('mesure d’audience', () => {
  it('reçoit un événement anonyme et refuse un champ inconnu', async () => {
    const app = buildApp();
    await request(app).post('/api/v1/analytics/events').send({ kind: 'product_view', productId: PRODUCT }).expect(204);
    await request(app)
      .post('/api/v1/analytics/events')
      .send({ kind: 'search', term: '  Robe WAX ', results: 3 })
      .expect(204);
    await request(app).post('/api/v1/analytics/events').send({ kind: 'visit', email: 'awa@example.ga' }).expect(400);
    expect(app.services.analyticsStore.events.map((e) => [e.kind, e.term])).toEqual([
      ['product_view', null],
      ['search', 'robe wax'],
    ]);
    await request(app).get('/api/v1/staff/analytics/searches').expect(401);
  });

  it('lit les consultations dans la forme des statistiques et supprime l’historique de plus de 13 mois', async () => {
    const { analytics, clock } = buildApp().services;
    await analytics.record({ kind: 'product_view', productId: PRODUCT });
    const from = new Date(clock.now().getTime() - DAY);
    const to = new Date(clock.now().getTime() + DAY);
    expect(await analytics.productEvents({ from, to }, owner)).toEqual([
      expect.objectContaining({ productId: PRODUCT, kind: 'view' }),
    ]);
    clock.advance(400 * DAY);
    expect(await analytics.purgeExpired()).toEqual({ deleted: 1 });
  });

  it('applique le plafond mensuel de l’assistant côté serveur', async () => {
    const { analytics, informationStore } = buildApp().services;
    await informationStore.repository.update({ assistantMonthlyBudget: 2 });
    expect((await analytics.consumeAssistant()).allowed).toBe(true);
    expect((await analytics.consumeAssistant()).allowed).toBe(true);
    expect(await analytics.consumeAssistant()).toMatchObject({ allowed: false, count: 2, limit: 2 });
  });
});
