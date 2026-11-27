import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from './factories.js';

const customer = {
  firstName: 'Awa',
  lastName: 'Ndong',
  email: 'awa@example.ga',
  password: 'motdepasse1',
  acceptTerms: true,
};
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/appareil-1',
  expirationTime: null,
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' },
};

/** Client connecté : cookies de session et jeton CSRF à renvoyer sur chaque écriture. */
async function signedIn() {
  const app = buildApp();
  const agent = request(app);
  const res = await agent.post('/api/v1/auth/registrations').send(customer).expect(201);
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = (name: string) => raw.find((c) => c.startsWith(`${name}=`))?.split(';')[0] ?? '';
  const csrf = cookie('ok_csrf').split('=')[1] ?? '';
  const jar = [cookie('ok_at'), cookie('ok_csrf')].join('; ');
  return { app, agent, jar, csrf };
}

describe('notifications push en HTTP', () => {
  it('donne la clé publique sans connexion mais exige un compte pour abonner un appareil', async () => {
    const agent = request(buildApp());
    const key = await agent.get('/api/v1/push/public-key').expect(200);
    expect(key.body.data).toEqual({ publicKey: 'cle-publique-de-test' });
    const res = await agent.post('/api/v1/push/subscriptions').send(subscription);
    expect([401, 403]).toContain(res.status);
  });

  it('abonne l’appareil du client connecté et refuse une adresse hors des services push', async () => {
    const { app, agent, jar, csrf } = await signedIn();
    const post = (body: object) =>
      agent.post('/api/v1/push/subscriptions').set('Cookie', jar).set('X-CSRF-Token', csrf).send(body);
    await post(subscription).expect(204);
    await post({ ...subscription, endpoint: 'https://127.0.0.1/interne' }).expect(400);
    expect(app.services.notificationsStore.subscriptions).toMatchObject([{ endpoint: subscription.endpoint }]);
  });

  it('lit et modifie les réglages du client', async () => {
    const { agent, jar, csrf } = await signedIn();
    const res = await agent
      .patch('/api/v1/notification-preferences')
      .set('Cookie', jar)
      .set('X-CSRF-Token', csrf)
      .send({ promotions: { push: true } })
      .expect(200);
    expect(res.body.data).toContainEqual({ topic: 'promotions', email: false, push: true, emailLocked: false });
    await agent
      .patch('/api/v1/notification-preferences')
      .set('Cookie', jar)
      .set('X-CSRF-Token', csrf)
      .send({ promotions: { sms: true } })
      .expect(400);
  });
});
