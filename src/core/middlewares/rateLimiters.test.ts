import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApiLimiter, createAuthLimiter, createStaffLimiter } from './rateLimiters.js';

/** Application minimale montée comme app.ts : /api/v1, limite générale puis limite du back-office. */
function appWith(apiMax: number, staffMax: number) {
  const app = express();
  app.use('/api/v1', createApiLimiter(apiMax), createStaffLimiter(staffMax), (_req, res) => {
    res.status(204).end();
  });
  return app;
}

const hit = (app: express.Express, path: string, times: number) =>
  Promise.all(Array.from({ length: times }, () => request(app).get(path)));

describe('limitation de débit', () => {
  it('compte le back-office à part : la boutique bloquée ne bloque pas l’équipe', async () => {
    const app = appWith(2, 5);
    await hit(app, '/api/v1/products', 2);
    expect((await request(app).get('/api/v1/products')).status).toBe(429);
    expect((await request(app).get('/api/v1/staff/orders')).status).toBe(204);
  });

  it('applique au back-office sa propre limite', async () => {
    const app = appWith(100, 3);
    await hit(app, '/api/v1/staff/orders', 3);
    const blocked = await request(app).get('/api/v1/staff/alerts');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    // La boutique garde son compteur
    expect((await request(app).get('/api/v1/products')).status).toBe(204);
  });

  it('ne confond pas un chemin qui commence seulement par « staff »', async () => {
    const app = appWith(1, 100);
    await request(app).get('/api/v1/staffing');
    expect((await request(app).get('/api/v1/staffing')).status).toBe(429);
  });
});

describe('limite des connexions', () => {
  function loginApp() {
    const app = express();
    app.use(express.json());
    app.post('/login', ...createAuthLimiter(), (_req: express.Request, res: express.Response) => {
      res.status(204).end();
    });
    return app;
  }
  const attempt = (app: express.Express, email: string) => request(app).post('/login').send({ email });

  it('bloque les essais répétés sur un même compte', async () => {
    const app = loginApp();
    for (let i = 0; i < 10; i++) await attempt(app, 'awa@okoume.ga').expect(204);
    expect((await attempt(app, 'AWA@okoume.ga')).status).toBe(429);
  });

  it('laisse se connecter les autres membres derrière la même connexion', async () => {
    const app = loginApp();
    for (let i = 0; i < 10; i++) await attempt(app, 'awa@okoume.ga');
    for (const email of ['paul@okoume.ga', 'nadia@okoume.ga', 'grace@okoume.ga'])
      expect((await attempt(app, email)).status).toBe(204);
  });
});
