import type { Permission } from '../../core/security/permissions.js';

export type NotificationTopic = 'orders' | 'shop';
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface Notifier {
  notifyCustomer(customerId: string, topic: NotificationTopic, message: PushMessage): Promise<void>;
  notifyStaff(permission: Permission, message: PushMessage, urgent?: boolean): Promise<void>;
}

/** Les notifications push sont hors MVP ; les e-mails transactionnels restent actifs. */
export const createNotifier = (_queue?: unknown): Notifier => ({
  notifyCustomer: async () => undefined,
  notifyStaff: async () => undefined,
});
