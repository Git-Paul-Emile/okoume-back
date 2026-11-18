import { describe, expect, it } from 'vitest';
import { createClock } from '../../../tests/factories.js';
import { createMemoryNotifications } from '../../../tests/memoryNotifications.js';
import { createFakePushSender } from '../../infrastructure/push/fakePushSender.js';
import { PushDeliveryError, type PushSender } from '../../infrastructure/push/pushSender.js';
import { createNotificationsService, createPushDelivery } from './notifications.service.js';

const message = { title: 'Commande OK-1', body: 'Votre commande est en route.', url: '/compte', tag: 'commande-OK-1' };
const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' };
const device = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/appareil-${n}`, keys });
const toCustomer = (notificationId: string, topic: 'orders' | 'promotions' = 'orders') => ({
  notificationId,
  audience: { customerId: 'c1', topic },
  message,
  urgent: false,
});

function setup(staff: Record<string, { role: 'orders_manager' | 'stock_manager' }> = {}) {
  const store = createMemoryNotifications((id) =>
    staff[id] ? { role: staff[id].role, extraRoles: [], customPermissions: [] } : null,
  );
  const sender = createFakePushSender();
  const service = createNotificationsService(store.repository, sender.publicKey);
  const deliver = createPushDelivery(store.repository, sender, createClock().now);
  return { store, sender, service, deliver };
}

describe('remise des notifications push', () => {
  it('sert tous les appareils du client, une seule fois même si le job est rejoué', async () => {
    const { service, sender, deliver } = setup();
    await service.subscribe({ customerId: 'c1' }, device(1), 'Chrome');
    await service.subscribe({ customerId: 'c1' }, device(2), 'Firefox');
    await deliver(toCustomer('n1'));
    await deliver(toCustomer('n1'));
    expect(sender.sent.map((s) => s.endpoint)).toEqual([device(1).endpoint, device(2).endpoint]);
  });

  it('respecte les réglages du client : rien pour un sujet coupé ou désactivé par défaut', async () => {
    const { service, sender, deliver } = setup();
    await service.subscribe({ customerId: 'c1' }, device(1), null);
    await deliver(toCustomer('n1', 'promotions'));
    await service.updatePreferences('c1', { orders: { push: false } });
    await deliver(toCustomer('n2'));
    expect(sender.sent).toEqual([]);
  });

  it('oublie un appareil désabonné côté navigateur', async () => {
    const { service, sender, store, deliver } = setup();
    await service.subscribe({ customerId: 'c1' }, device(1), null);
    sender.gone.add(device(1).endpoint);
    await deliver(toCustomer('n1'));
    expect(store.subscriptions).toEqual([]);
  });

  it('sur un échec passager, sert les autres appareils et ne retente que celui en échec', async () => {
    const { service, store } = setup();
    await service.subscribe({ customerId: 'c1' }, device(1), null);
    await service.subscribe({ customerId: 'c1' }, device(2), null);
    const sent: string[] = [];
    let failFirst = true;
    const flaky: PushSender = {
      publicKey: 'cle',
      async send(target) {
        if (target.endpoint === device(1).endpoint && failFirst) {
          failFirst = false;
          throw new PushDeliveryError(503);
        }
        sent.push(target.endpoint);
        return 'sent';
      },
    };
    const deliver = createPushDelivery(store.repository, flaky, createClock().now);
    await expect(deliver(toCustomer('n1'))).rejects.toBeInstanceOf(PushDeliveryError);
    expect(sent).toEqual([device(2).endpoint]);
    await deliver(toCustomer('n1'));
    expect(sent).toEqual([device(2).endpoint, device(1).endpoint]);
  });

  it('n’alerte que les membres de l’équipe qui ont le droit demandé', async () => {
    const { service, sender, deliver } = setup({ s1: { role: 'orders_manager' }, s2: { role: 'stock_manager' } });
    await service.subscribe({ staffId: 's1' }, device(1), null);
    await service.subscribe({ staffId: 's2' }, device(2), null);
    await service.subscribe({ staffId: 'inactif' }, device(3), null);
    await deliver({ notificationId: 'n1', audience: { permission: 'commandes:consulter' }, message, urgent: true });
    expect(sender.sent).toEqual([{ endpoint: device(1).endpoint, message, urgent: true }]);
  });

  it('rattache un appareil au dernier compte connecté et ne laisse pas un autre compte le retirer', async () => {
    const { service, store } = setup();
    await service.subscribe({ customerId: 'c1' }, device(1), null);
    await service.subscribe({ customerId: 'c2' }, device(1), null);
    await service.unsubscribe({ customerId: 'c1' }, device(1).endpoint);
    expect(store.subscriptions).toMatchObject([{ customerId: 'c2' }]);
  });
});

describe('réglages de notification', () => {
  it('complète les réglages sans jamais couper l’e-mail obligatoire', async () => {
    const { service } = setup();
    await service.updatePreferences('c1', { promotions: { push: true } });
    const prefs = await service.updatePreferences('c1', { orders: { email: false, push: false } });
    expect(prefs).toContainEqual({ topic: 'orders', email: true, push: false, emailLocked: true });
    expect(prefs).toContainEqual({ topic: 'promotions', email: false, push: true, emailLocked: false });
  });
});
