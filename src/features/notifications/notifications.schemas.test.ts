import { describe, expect, it } from 'vitest';
import { subscriptionBody } from './notifications.schemas.js';

const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' };
const accepts = (endpoint: string) => subscriptionBody.safeParse({ endpoint, keys, expirationTime: null }).success;

describe('adresse d’abonnement push', () => {
  it('accepte les services push des navigateurs', () => {
    expect(accepts('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(accepts('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(accepts('https://web.push.apple.com/abc')).toBe(true);
    expect(accepts('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
  });

  it('refuse toute autre adresse, pour que le serveur ne puisse pas viser le réseau interne', () => {
    expect(accepts('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(accepts('https://fcm.googleapis.com:8443/fcm/send/abc')).toBe(false);
    expect(accepts('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(accepts('https://fcm.googleapis.com.attaquant.example/abc')).toBe(false);
    expect(accepts('https://notify.windows.com.attaquant.example/abc')).toBe(false);
  });
});
