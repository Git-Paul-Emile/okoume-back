import type { Permission } from '../../core/security/permissions.js';
import type { PushMessage } from '../../infrastructure/push/pushSender.js';
import type { NotificationTopic } from './notifications.rules.js';

/**
 * Dépôt des notifications push dans la file, pour les autres services : ils ne connaissent ni le protocole
 * ni les appareils. Le dépôt ne fait jamais échouer l'action métier qui l'a déclenché (10.1).
 */
export interface Notifier {
  notifyCustomer(customerId: string, topic: NotificationTopic, message: PushMessage): Promise<void>;
  notifyStaff(permission: Permission, message: PushMessage, urgent?: boolean): Promise<void>;
}

/** Notifications push retirées du MVP. Les e-mails transactionnels restent actifs. */
export const createNotifier = (_queue: unknown): Notifier => ({
  notifyCustomer: async (_customerId, _topic, _message) => undefined,
  notifyStaff: async (_permission, _message, _urgent = false) => undefined,
});
