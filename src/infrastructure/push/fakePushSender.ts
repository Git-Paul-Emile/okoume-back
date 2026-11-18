import type { PushMessage, PushResult, PushSender, PushTarget } from './pushSender.js';

/** Implémentation de test : garde les envois en mémoire ; un appareil peut être déclaré désabonné. */
export function createFakePushSender(): PushSender & {
  sent: Array<{ endpoint: string; message: PushMessage; urgent: boolean }>;
  gone: Set<string>;
} {
  const sent: Array<{ endpoint: string; message: PushMessage; urgent: boolean }> = [];
  const gone = new Set<string>();
  return {
    publicKey: 'cle-publique-de-test',
    sent,
    gone,
    async send(target: PushTarget, message: PushMessage, { urgent }): Promise<PushResult> {
      if (gone.has(target.endpoint)) return 'gone';
      sent.push({ endpoint: target.endpoint, message, urgent });
      return 'sent';
    },
  };
}
