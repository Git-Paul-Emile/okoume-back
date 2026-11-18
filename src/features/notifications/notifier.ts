import { randomUUID } from 'node:crypto';
import type { Permission } from '../../core/security/permissions.js';
import type { PushMessage } from '../../infrastructure/push/pushSender.js';
import type { JobQueue } from '../../infrastructure/queue/jobQueue.js';
import type { JobPayloads } from '../../infrastructure/queue/jobs.js';
import { logger } from '../../lib/logger.js';
import type { NotificationTopic } from './notifications.rules.js';

/**
 * Dépôt des notifications push dans la file, pour les autres services : ils ne connaissent ni le protocole
 * ni les appareils. Le dépôt ne fait jamais échouer l'action métier qui l'a déclenché (10.1).
 */
export interface Notifier {
  notifyCustomer(customerId: string, topic: NotificationTopic, message: PushMessage): Promise<void>;
  notifyStaff(permission: Permission, message: PushMessage, urgent?: boolean): Promise<void>;
}

export const createNotifier = (queue: JobQueue): Notifier => {
  async function enqueue(data: JobPayloads['push.send']) {
    try {
      await queue.send('push.send', data);
    } catch (err) {
      logger.error({ err }, 'Notification push non déposée');
    }
  }

  return {
    notifyCustomer: (customerId, topic, message) =>
      enqueue({ notificationId: randomUUID(), audience: { customerId, topic }, message, urgent: false }),
    notifyStaff: (permission, message, urgent = false) =>
      enqueue({ notificationId: randomUUID(), audience: { permission }, message, urgent }),
  };
};
