import { describe, expect, it } from 'vitest';
import { createResendEmailSender } from './resendEmailSender.js';

const message = { to: 'awa@example.ga', subject: 'Votre code', text: 'Code : 123456' };
const config = { apiKey: 're_test_cle_factice', from: 'OKOZA <no-reply@okoza.test>' };

/** Faux fetch qui répond selon une liste de réponses prévues et garde chaque requête. */
const scriptedFetch = (responses: Array<Response | Error>) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('Appel inattendu');
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch, calls };
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const headerOf = (init: RequestInit, name: string) => new Headers(init.headers).get(name);
const noSleep = async () => undefined;

describe('envoi des e-mails par Resend', () => {
  it('envoie le message avec la clé, l’expéditeur et une clé d’idempotence', async () => {
    const { fetch, calls } = scriptedFetch([json(200, { id: 'abc' })]);
    await createResendEmailSender(config, { fetch, sleep: noSleep }).send(message);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe('https://api.resend.com/emails');
    expect(call?.init.method).toBe('POST');
    expect(headerOf(call!.init, 'Authorization')).toBe('Bearer re_test_cle_factice');
    expect(headerOf(call!.init, 'Idempotency-Key')).toBeTruthy();
    expect(JSON.parse(String(call?.init.body))).toEqual({ from: config.from, ...message });
  });

  it('réessaie une erreur passagère avec la même clé d’idempotence', async () => {
    const { fetch, calls } = scriptedFetch([
      new TypeError('fetch failed'),
      json(429, { type: 'rate_limit_exceeded', message: 'Too many requests' }),
      json(200, { id: 'abc' }),
    ]);
    const delays: number[] = [];
    await createResendEmailSender(config, { fetch, sleep: async (ms) => delays.push(ms) }).send(message);
    expect(calls).toHaveLength(3);
    const keys = new Set(calls.map((c) => headerOf(c.init, 'Idempotency-Key')));
    expect(keys.size).toBe(1);
    expect(delays).toEqual([1_000, 3_000]);
  });

  it('abandonne sans réessayer une erreur définitive', async () => {
    const { fetch, calls } = scriptedFetch([json(403, { type: 'validation_error', message: 'domain not verified' })]);
    await expect(createResendEmailSender(config, { fetch, sleep: noSleep }).send(message)).rejects.toMatchObject({
      status: 503,
      code: 'EMAIL_UNAVAILABLE',
    });
    expect(calls).toHaveLength(1);
  });

  it('abandonne après trois essais sur une panne du fournisseur', async () => {
    const { fetch, calls } = scriptedFetch([
      json(503, { type: 'service_unavailable' }),
      json(500, { type: 'application_error' }),
      new Response('passerelle', { status: 502 }),
    ]);
    await expect(createResendEmailSender(config, { fetch, sleep: noSleep }).send(message)).rejects.toMatchObject({
      code: 'EMAIL_UNAVAILABLE',
    });
    expect(calls).toHaveLength(3);
  });

  it('ne traite pas un quota épuisé comme passager', async () => {
    const { fetch, calls } = scriptedFetch([json(429, { type: 'daily_quota_exceeded' })]);
    await expect(createResendEmailSender(config, { fetch, sleep: noSleep }).send(message)).rejects.toMatchObject({
      code: 'EMAIL_UNAVAILABLE',
    });
    expect(calls).toHaveLength(1);
  });
});
