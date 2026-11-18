import { describe, expect, it } from 'vitest';
import { createQueuedEmailSender } from '../infrastructure/email/queuedEmailSender.js';
import type { EmailMessage, EmailSender, SendOptions } from '../infrastructure/email/emailSender.js';
import { createMemoryJobQueue } from '../infrastructure/queue/memoryJobQueue.js';
import { createMemoryEmailDeliveries } from '../../tests/memoryEmailDeliveries.js';
import { createDeadEmailHandler, createSendEmailHandler } from './email.jobs.js';

const message = { to: 'awa@example.ga', subject: 'Votre commande', text: 'Commande confirmée.' };
const now = () => new Date('2026-11-03T08:00:00.000Z');

/** Faux fournisseur qui ne délivre qu'une fois par clé, comme l'idempotence de Resend. */
const idempotentSender = () => {
  const delivered = new Map<string, EmailMessage>();
  const sender: EmailSender = {
    async send(m: EmailMessage, options?: SendOptions) {
      if (!options?.idempotencyKey) throw new Error('clé d’idempotence attendue');
      if (!delivered.has(options.idempotencyKey)) delivered.set(options.idempotencyKey, m);
    },
  };
  return { sender, delivered };
};

const failing: EmailSender = {
  send: async () => {
    throw new Error('fournisseur indisponible');
  },
};

describe('envoi des e-mails par la file', () => {
  it('dépose l’e-mail dans la file avec un identifiant d’envoi, au lieu de l’envoyer pendant la requête', async () => {
    const queue = createMemoryJobQueue();
    await createQueuedEmailSender(queue).send(message);
    expect(queue.jobs).toEqual([{ name: 'email.send', data: { ...message, deliveryId: expect.any(String) } }]);
  });

  it('rejouer le même envoi ne délivre l’e-mail qu’une fois, puis efface son texte du suivi', async () => {
    const { sender, delivered } = idempotentSender();
    const store = createMemoryEmailDeliveries(now);
    const handle = createSendEmailHandler(sender, store.repository, now);
    const job = { id: 'job-1', data: { ...message, deliveryId: 'd1' } };
    await handle([job]);
    await handle([job]);
    expect(delivered.size).toBe(1);
    expect(store.deliveries[0]).toMatchObject({ id: 'd1', status: 'sent', attempts: 2, text: null });
  });

  it('garde l’erreur, laisse la file reprendre, puis marque l’échec définitif', async () => {
    const store = createMemoryEmailDeliveries(now);
    const job = { id: 'job-1', data: { ...message, deliveryId: 'd1' } };
    await expect(createSendEmailHandler(failing, store.repository, now)([job])).rejects.toThrow();
    // En file d'échec, le job a un autre identifiant : l'identifiant d'envoi suit
    await createDeadEmailHandler(store.repository)([{ id: 'dead-1', data: job.data }]);
    expect(store.deliveries[0]).toMatchObject({
      status: 'failed',
      lastError: 'fournisseur indisponible',
      text: 'Commande confirmée.',
    });
  });

  it('ne conserve jamais le texte d’un e-mail qui contient un code', async () => {
    const store = createMemoryEmailDeliveries(now);
    const job = { id: 'job-1', data: { ...message, text: 'Code : 123456', sensitive: true, deliveryId: 'd1' } };
    await expect(createSendEmailHandler(failing, store.repository, now)([job])).rejects.toThrow();
    expect(store.deliveries[0]).toMatchObject({ sensitive: true, text: null });
  });
});
