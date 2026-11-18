import request from 'supertest';
import { describe, it } from 'vitest';
import { buildApp } from './factories.js';

describe('données personnelles HTTP', () => {
  it('réserve les demandes, l’export et la suppression au compte connecté', async () => {
    const app = buildApp();
    await request(app).get('/api/v1/me/privacy-requests').expect(401);
    await request(app).post('/api/v1/me/data-exports').expect(401);
    await request(app).post('/api/v1/me/account-deletion').send({ password: 'x' }).expect(401);
  });

  it('réserve le suivi à l’équipe', async () => {
    const app = buildApp();
    await request(app).get('/api/v1/staff/privacy-requests').expect(401);
    await request(app)
      .patch('/api/v1/staff/privacy-requests/11111111-1111-4111-8111-111111111111')
      .send({ status: 'in_progress' })
      .expect(401);
  });
});
