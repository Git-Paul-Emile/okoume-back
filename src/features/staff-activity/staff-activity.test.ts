import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../tests/factories.js';
import { recordStaffActivity } from './staff-activity.middleware.js';
import { describe as describeRoute } from './staff-activity.service.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const manager = { id: 's1', role: 'orders_manager' as const, extraRoles: [], customPermissions: [] };
const STAFF_ID = '11111111-1111-4111-8111-111111111111';

/** Application minimale : la route pose le membre comme le ferait l'authentification, puis répond. */
function harness(status: number) {
  const { services } = buildApp();
  const app = express();
  app.use('/staff', recordStaffActivity(services.staffActivity));
  const handler = (req: express.Request, res: express.Response) => {
    req.staff = { ...manager, id: STAFF_ID, sessionIssuedAt: new Date(), refundLimit: null };
    res.status(status).end();
  };
  app.patch('/staff/orders/:id/status', handler);
  app.get('/staff/orders', handler);
  return { app, services };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('journal d’activité', () => {
  it('inscrit une écriture réussie, avec son domaine, après la réponse', async () => {
    const { app, services } = harness(200);
    await request(app).patch('/staff/orders/CMD-1/status?x=1').expect(200);
    await settle();
    expect(services.staffActivityStore.entries).toEqual([
      expect.objectContaining({
        staffId: STAFF_ID,
        area: 'Commandes',
        action: 'Modification : CMD-1 / status',
        path: '/staff/orders/CMD-1/status',
      }),
    ]);
  });

  it('ignore les lectures et les écritures refusées', async () => {
    const ok = harness(200);
    await request(ok.app).get('/staff/orders').expect(200);
    const refused = harness(409);
    await request(refused.app).patch('/staff/orders/CMD-1/status').expect(409);
    await settle();
    expect(ok.services.staffActivityStore.entries).toHaveLength(0);
    expect(refused.services.staffActivityStore.entries).toHaveLength(0);
  });

  it('réserve la lecture à l’administrateur principal', async () => {
    const { services } = buildApp();
    await expect(services.staffActivity.list({ page: 1, limit: 20 }, manager)).rejects.toMatchObject({ status: 403 });
    await expect(services.staffActivity.list({ page: 1, limit: 20 }, owner)).resolves.toMatchObject({ total: 0 });
  });

  it('nomme un domaine inconnu par son segment', () => {
    expect(describeRoute('DELETE', '/staff/nouveau/1')).toEqual({ area: 'nouveau', action: 'Suppression : 1' });
  });
});

describe('exports déclarés au journal', () => {
  const input = { title: 'Commandes', format: 'pdf' as const, rows: 42, reason: 'Bilan mensuel pour la comptabilité' };

  it('garde le motif, le format et le nombre de lignes dans l’entrée du journal', async () => {
    const { services } = buildApp();
    await services.staffActivity.recordExport(input, { ...owner, id: STAFF_ID });
    expect(services.staffActivityStore.entries).toEqual([
      expect.objectContaining({
        staffId: STAFF_ID,
        area: 'Exports',
        action: 'Export Commandes (PDF, 42 lignes) : Bilan mensuel pour la comptabilité',
      }),
    ]);
  });

  it('refuse un membre sans droit d’export', async () => {
    const { services } = buildApp();
    await expect(services.staffActivity.recordExport(input, { ...manager, id: STAFF_ID })).rejects.toMatchObject({
      status: 403,
    });
    expect(services.staffActivityStore.entries).toHaveLength(0);
  });

  it('n’inscrit pas l’export une seconde fois par l’enregistrement automatique', async () => {
    const { services } = buildApp();
    const app = express();
    app.use('/staff', recordStaffActivity(services.staffActivity));
    app.post('/staff/exports', (req, res) => {
      req.staff = { ...manager, id: STAFF_ID, sessionIssuedAt: new Date(), refundLimit: null };
      res.status(201).end();
    });
    await request(app).post('/staff/exports').expect(201);
    await settle();
    expect(services.staffActivityStore.entries).toHaveLength(0);
  });
});
