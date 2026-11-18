import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from './factories.js';

const contact = {
  name: 'Awa Ndong',
  email: 'awa@example.ga',
  category: 'produit',
  subject: 'Taille de la robe',
  message: 'La robe wax existe-t-elle en taille XL ? Merci de me répondre.',
};

describe('assistance HTTP', () => {
  it('accepte le formulaire de contact sans compte, pas un champ inconnu', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/v1/support/tickets').send(contact).expect(201);
    expect(res.body.data.number).toMatch(/^SAV-/);
    await request(app)
      .post('/api/v1/support/tickets')
      .send({ ...contact, priority: 'high' })
      .expect(400);
  });

  it('réserve le suivi au compte et la file à l’équipe', async () => {
    const app = buildApp();
    await request(app).get('/api/v1/support/tickets').expect(401);
    await request(app).post('/api/v1/support/attachment-uploads').expect(401);
    await request(app).get('/api/v1/staff/support/tickets').expect(401);
    await request(app).get('/api/v1/support/tickets/SAV-2026-ABCDEF').expect(401);
  });
});
