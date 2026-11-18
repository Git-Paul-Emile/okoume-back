import { can } from '../../core/security/permissions.js';
import { PushDeliveryError, type PushSender } from '../../infrastructure/push/pushSender.js';
import type { JobPayloads } from '../../infrastructure/queue/jobs.js';
import { logger } from '../../lib/logger.js';
import type { NotificationsRepository, PushOwner, SubscriptionRecord } from './notifications.repository.js';
import { effectivePrefs, enabled, TOPICS, type NotificationPrefs } from './notifications.rules.js';
import type { PrefsInput, SubscriptionInput } from './notifications.schemas.js';

/**
 * Abonnements des appareils et préférences du client, côté API (10.3). publicKey vaut null quand les
 * notifications push ne sont pas configurées : l'interface n'en propose alors pas l'activation.
 */
export const createNotificationsService = (repository: NotificationsRepository, publicKey: string | null) => ({
  publicKey: () => ({ publicKey }),

  async subscribe(owner: PushOwner, input: SubscriptionInput, userAgent: string | null) {
    await repository.saveSubscription(owner, {
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent,
    });
  },

  unsubscribe: (owner: PushOwner, endpoint: string) => repository.deleteSubscription(owner, endpoint),

  async preferences(customerId: string) {
    return effectivePrefs((await repository.prefs(customerId)) ?? {});
  },

  /** Les réglages envoyés complètent les précédents ; l'e-mail obligatoire reste actif quoi qu'il arrive. */
  async updatePreferences(customerId: string, input: PrefsInput) {
    const current = (await repository.prefs(customerId)) ?? {};
    const next: NotificationPrefs = { ...current };
    for (const topic of TOPICS) {
      const channels = input[topic];
      if (channels) next[topic] = { ...current[topic], ...channels };
    }
    await repository.savePrefs(customerId, next);
    return effectivePrefs(next);
  },
});

export type NotificationsService = ReturnType<typeof createNotificationsService>;

/**
 * Remise d'une notification aux appareils de ses destinataires, dans le worker. Chaque appareil est marqué
 * avant l'envoi : une reprise du job ne renvoie rien aux appareils déjà servis (10.4).
 */
export const createPushDelivery = (repository: NotificationsRepository, sender: PushSender, now: () => Date) => {
  async function recipients(audience: JobPayloads['push.send']['audience']): Promise<SubscriptionRecord[]> {
    if ('permission' in audience)
      return (await repository.staffSubscriptions()).filter((s) => can(s.grantee, audience.permission));
    const prefs = await repository.prefs(audience.customerId);
    if (!prefs || !enabled(prefs, audience.topic, 'push')) return [];
    return repository.customerSubscriptions(audience.customerId);
  }

  return async function deliver({ notificationId, audience, message, urgent }: JobPayloads['push.send']) {
    let failure: PushDeliveryError | null = null;
    for (const subscription of await recipients(audience)) {
      if (!(await repository.markDelivered(notificationId, subscription.id, now()))) continue;
      try {
        if ((await sender.send(subscription, message, { urgent })) === 'gone')
          await repository.deleteById(subscription.id);
      } catch (err) {
        if (!(err instanceof PushDeliveryError)) throw err;
        // Les autres appareils sont servis ; celui-ci sera retenté à la reprise du job
        await repository.unmarkDelivered(notificationId, subscription.id);
        logger.warn({ notificationId, statusCode: err.statusCode }, 'Notification push à retenter');
        failure = err;
      }
    }
    if (failure) throw failure;
  };
};

export type PushDelivery = ReturnType<typeof createPushDelivery>;
