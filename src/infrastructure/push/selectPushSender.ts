import type { Env } from '../../config/env.js';
import type { PushSender } from './pushSender.js';
import { createWebPushSender } from './webPushSender.js';

/** Envoi push configuré, ou null : les notifications push sont alors désactivées, les e-mails continuent. */
export const selectPushSender = (
  config: Pick<Env, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'>,
): PushSender | null =>
  config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY && config.VAPID_SUBJECT
    ? createWebPushSender({
        publicKey: config.VAPID_PUBLIC_KEY,
        privateKey: config.VAPID_PRIVATE_KEY,
        subject: config.VAPID_SUBJECT,
      })
    : null;
