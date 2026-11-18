import { randomUUID } from 'node:crypto';
import type { Grantee } from '../src/core/security/permissions.js';
import type {
  NotificationsRepository,
  PushOwner,
  SubscriptionRecord,
} from '../src/features/notifications/notifications.repository.js';
import type { NotificationPrefs } from '../src/features/notifications/notifications.rules.js';

type StoredSubscription = SubscriptionRecord & { customerId: string | null; staffId: string | null };

/**
 * Abonnements push en mémoire, même contrat que Prisma. Les droits de l'équipe viennent de staffGrantee
 * (null : compte inactif, ses appareils ne reçoivent rien) ; tout client connu des tests existe.
 */
export function createMemoryNotifications(staffGrantee: (staffId: string) => Grantee | null = () => null) {
  const subscriptions: StoredSubscription[] = [];
  const deliveries = new Set<string>();
  const prefs = new Map<string, NotificationPrefs>();
  const ownedBy = (s: StoredSubscription, owner: PushOwner) =>
    'customerId' in owner ? s.customerId === owner.customerId : s.staffId === owner.staffId;
  const keyOf = (notificationId: string, subscriptionId: string) => `${notificationId}:${subscriptionId}`;

  const repository: NotificationsRepository = {
    async saveSubscription(owner, { endpoint, p256dh, auth }) {
      const ownerColumns =
        'customerId' in owner
          ? { customerId: owner.customerId, staffId: null }
          : { staffId: owner.staffId, customerId: null };
      const existing = subscriptions.find((s) => s.endpoint === endpoint);
      if (existing) Object.assign(existing, { p256dh, auth, ...ownerColumns });
      else subscriptions.push({ id: randomUUID(), endpoint, p256dh, auth, ...ownerColumns });
    },
    async deleteSubscription(owner, endpoint) {
      const index = subscriptions.findIndex((s) => s.endpoint === endpoint && ownedBy(s, owner));
      if (index >= 0) subscriptions.splice(index, 1);
    },
    async deleteById(id) {
      const index = subscriptions.findIndex((s) => s.id === id);
      if (index >= 0) subscriptions.splice(index, 1);
    },
    async customerSubscriptions(customerId) {
      return subscriptions.filter((s) => s.customerId === customerId);
    },
    async staffSubscriptions() {
      return subscriptions.flatMap((s) => {
        const grantee = s.staffId ? staffGrantee(s.staffId) : null;
        return grantee ? [{ ...s, grantee }] : [];
      });
    },
    async markDelivered(notificationId, subscriptionId) {
      const key = keyOf(notificationId, subscriptionId);
      if (deliveries.has(key)) return false;
      deliveries.add(key);
      return true;
    },
    async unmarkDelivered(notificationId, subscriptionId) {
      deliveries.delete(keyOf(notificationId, subscriptionId));
    },
    async prefs(customerId) {
      return prefs.get(customerId) ?? {};
    },
    async savePrefs(customerId, value) {
      prefs.set(customerId, value);
    },
  };
  return { repository, subscriptions, deliveries };
}
