import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../src/core/middlewares/errorHandler.js';
import { requirePermission } from '../src/core/middlewares/authenticate.js';
import { buildApp } from './factories.js';

const customer = {
  firstName: 'Awa',
  lastName: 'Ndong',
  email: 'awa@example.ga',
  password: 'motdepasse1',
  acceptTerms: true,
};

const codeIn = (text: string | undefined) => /\b(\d{6})\b/.exec(text ?? '')?.[1] ?? '';

/** Cookies posés par une réponse, sous forme « nom=valeur » réutilisable et brute pour les attributs. */
const cookiesOf = (res: request.Response) => {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const find = (name: string) => raw.find((c) => c.startsWith(`${name}=`)) ?? '';
  const value = (name: string) => find(name).split(';')[0] ?? '';
  return { raw: find, value };
};

async function signedInCustomer() {
  const app = buildApp();
  const agent = request(app);
  await agent.post('/api/v1/auth/registrations').send(customer).expect(202);
  const code = codeIn(app.services.email.last(customer.email)?.text);
  const res = await agent.post('/api/v1/auth/verifications').send({ email: customer.email, code }).expect(200);
  return { app, agent, cookies: cookiesOf(res) };
}

describe('authentification HTTP des clients', () => {
  it('répond pareil à l’inscription, que l’adresse soit libre ou non', async () => {
    const { agent } = await signedInCustomer();
    const res = await agent.post('/api/v1/auth/registrations').send(customer);
    expect(res.status).toBe(202);
    expect(res.body.message).toContain('Si les informations sont correctes');
  });

  it('pose des cookies de session HttpOnly et un jeton CSRF lisible', async () => {
    const { cookies } = await signedInCustomer();
    expect(cookies.raw('ok_at')).toMatch(/HttpOnly/i);
    expect(cookies.raw('ok_rt')).toMatch(/HttpOnly/i);
    expect(cookies.raw('ok_rt')).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookies.raw('ok_csrf')).not.toMatch(/HttpOnly/i);
    expect(cookies.raw('ok_at')).toMatch(/SameSite=Lax/i);
  });

  it('donne accès au compte avec le cookie d’accès, et pas sans', async () => {
    const { agent, cookies } = await signedInCustomer();
    await agent.get('/api/v1/auth/me').expect(401);
    const res = await agent.get('/api/v1/auth/me').set('Cookie', cookies.value('ok_at')).expect(200);
    expect(res.body.data).toMatchObject({ email: customer.email });
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('refuse une modification avec cookie de session mais sans jeton CSRF', async () => {
    const { agent, cookies } = await signedInCustomer();
    const res = await agent.delete('/api/v1/auth/sessions/current').set('Cookie', cookies.value('ok_rt'));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_REJECTED');
  });

  it('ferme la session avec le jeton CSRF, et le jeton de renouvellement ne sert plus', async () => {
    const { agent, cookies } = await signedInCustomer();
    const csrf = cookies.value('ok_csrf').split('=')[1] ?? '';
    const jar = [cookies.value('ok_rt'), cookies.value('ok_csrf')].join('; ');
    await agent.delete('/api/v1/auth/sessions/current').set('Cookie', jar).set('X-CSRF-Token', csrf).expect(204);
    const res = await agent.post('/api/v1/auth/sessions/refresh').set('Cookie', jar).set('X-CSRF-Token', csrf);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_EXPIRED');
  });

  it('refuse un champ inattendu dans le corps (assignation de masse)', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/registrations')
      .send({ ...customer, status: 'active' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('autorisation de l’équipe', () => {
  it('refuse l’espace équipe sans session', async () => {
    await request(buildApp()).get('/api/v1/staff/auth/me').expect(401);
  });

  it('n’accepte pas un cookie client pour l’espace équipe', async () => {
    const { agent, cookies } = await signedInCustomer();
    await agent
      .get('/api/v1/staff/auth/me')
      .set('Cookie', cookies.value('ok_at').replace('ok_at', 'ok_staff_at'))
      .expect(401);
  });

  it('vérifie le droit demandé sur le compte relu en base', async () => {
    const guarded = express()
      .use((req, _res, next) => {
        req.staff = {
          id: 's1',
          sessionIssuedAt: new Date(),
          refundLimit: null,
          role: 'catalog_manager',
          extraRoles: [],
          customPermissions: [],
        };
        next();
      })
      .get('/remboursements', requirePermission('paiements:valider'), (_req, res) => res.status(204).end())
      .get('/produits', requirePermission('catalogue:modifier'), (_req, res) => res.status(204).end())
      .use(errorHandler);
    await request(guarded).get('/remboursements').expect(403);
    await request(guarded).get('/produits').expect(204);
  });
});
