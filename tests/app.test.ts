import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from './factories.js';

describe('socle de l’API', () => {
  it('répond à la sonde de vie', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: 200, data: { status: 'ok' } });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('est prête quand la base répond', async () => {
    const res = await request(buildApp()).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ready: true, checks: { database: { status: 'up' } } });
  });

  it('signale l’indisponibilité quand la base ne répond pas, sans détail interne', async () => {
    const res = await request(buildApp({ databaseUp: false })).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_READY' });
    expect(JSON.stringify(res.body)).not.toContain('connexion refusée');
  });

  it('renvoie une 404 au format standard pour une route inconnue', async () => {
    const res = await request(buildApp()).get('/api/v1/inexistant');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, status: 404, code: 'NOT_FOUND' });
    expect(res.body.requestId).toBeTruthy();
  });

  it('refuse un corps JSON illisible avec une 400', async () => {
    const res = await request(buildApp())
      .post('/api/v1/inexistant')
      .set('Content-Type', 'application/json')
      .send('{"mal formé"');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('reprend l’identifiant de corrélation envoyé par le front', async () => {
    const res = await request(buildApp()).get('/health').set('X-Request-Id', 'front-1234abcd');
    expect(res.headers['x-request-id']).toBe('front-1234abcd');
  });

  it('pose les en-têtes de sécurité et masque la technologie', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeTruthy();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('n’autorise que les origines déclarées', async () => {
    const allowed = await request(buildApp()).get('/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const other = await request(buildApp()).get('/health').set('Origin', 'https://pirate.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
