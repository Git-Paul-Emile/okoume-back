import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../tests/factories.js';

const owner = { id: 's0', role: 'super_admin' as const, extraRoles: [], customPermissions: [] };
const stock = { id: 's2', role: 'stock_manager' as const, extraRoles: [], customPermissions: [] };
const input = { neighbourhood: 'Bikélé', city: 'Ntoum', contact: '+241 06 22 41 18' };

describe('demandes de nouveau quartier', () => {
  it('prévient l’équipe des livraisons sans rien renvoyer au visiteur de ce qu’il a saisi', async () => {
    const { zoneRequests, pushQueue } = buildApp().services;
    expect(Object.keys(await zoneRequests.create(input))).toEqual(['id']);
    expect(pushQueue.jobs.at(-1)?.data).toMatchObject({ audience: { permission: 'commandes:consulter' } });
  });

  it('donne une seule suite à une demande, réservée aux droits sur les commandes', async () => {
    const { zoneRequests } = buildApp().services;
    const { id } = await zoneRequests.create(input);
    await expect(zoneRequests.list(stock)).rejects.toMatchObject({ status: 403 });
    await zoneRequests.decide(id, { status: 'declined', note: 'Hors de notre rayon' }, owner);
    await expect(zoneRequests.decide(id, { status: 'added', note: 'Zone ouverte' }, owner)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('accepte la demande sans compte et refuse un champ inconnu', async () => {
    const app = buildApp();
    await request(app).post('/api/v1/zone-requests').send(input).expect(201);
    await request(app)
      .post('/api/v1/zone-requests')
      .send({ ...input, status: 'added' })
      .expect(400);
    await request(app).get('/api/v1/staff/zone-requests').expect(401);
  });
});
