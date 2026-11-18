import { prisma } from '../../lib/prisma.js';
import type { Grantee } from '../../core/security/permissions.js';
import { parsePrefs, type NotificationPrefs } from './notifications.rules.js';

export type PushOwner = { customerId: string } | { staffId: string };

export interface SubscriptionRecord {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface StaffSubscriptionRecord extends SubscriptionRecord {
  grantee: Grantee;
}

/** Contrat des abonnements push et des préférences de notification. */
export interface NotificationsRepository {
  /** Un appareil, une adresse : se réabonner rattache l'adresse au compte connecté. */
  saveSubscription(
    owner: PushOwner,
    subscription: { endpoint: string; p256dh: string; auth: string; userAgent: string | null },
  ): Promise<void>;
  deleteSubscription(owner: PushOwner, endpoint: string): Promise<void>;
  deleteById(id: string): Promise<void>;
  customerSubscriptions(customerId: string): Promise<SubscriptionRecord[]>;
  /** Abonnements des membres actifs de l'équipe, avec leurs droits pour filtrer les destinataires. */
  staffSubscriptions(): Promise<StaffSubscriptionRecord[]>;
  /** true la première fois, false si cette notification a déjà été remise à cet appareil (10.4). */
  markDelivered(notificationId: string, subscriptionId: string, at: Date): Promise<boolean>;
  /** Annule la marque si l'envoi échoue : la reprise du job réessaiera cet appareil. */
  unmarkDelivered(notificationId: string, subscriptionId: string): Promise<void>;
  prefs(customerId: string): Promise<NotificationPrefs | null>;
  savePrefs(customerId: string, prefs: NotificationPrefs): Promise<void>;
}

const subscriptionSelect = { id: true, endpoint: true, p256dh: true, auth: true } as const;

export const notificationsRepository: NotificationsRepository = {
  async saveSubscription(owner, { endpoint, ...keys }) {
    const ownerColumns =
      'customerId' in owner
        ? { customerId: owner.customerId, staffId: null }
        : { staffId: owner.staffId, customerId: null };
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, ...keys, ...ownerColumns },
      update: { ...keys, ...ownerColumns },
      select: { id: true },
    });
  },

  async deleteSubscription(owner, endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, ...owner } });
  },

  async deleteById(id) {
    await prisma.pushSubscription.deleteMany({ where: { id } });
  },

  customerSubscriptions: (customerId) =>
    prisma.pushSubscription.findMany({ where: { customerId }, select: subscriptionSelect }),

  async staffSubscriptions() {
    const rows = await prisma.pushSubscription.findMany({
      where: { staff: { status: 'active' } },
      select: {
        ...subscriptionSelect,
        staff: {
          select: {
            role: true,
            extraRoles: true,
            customRoles: { select: { customRole: { select: { permissions: true } } } },
          },
        },
      },
    });
    return rows.flatMap(({ staff, ...subscription }) =>
      staff
        ? [
            {
              ...subscription,
              grantee: {
                role: staff.role,
                extraRoles: staff.extraRoles,
                customPermissions: staff.customRoles.flatMap((r) => r.customRole.permissions),
              },
            },
          ]
        : [],
    );
  },

  async markDelivered(notificationId, subscriptionId, at) {
    const created = await prisma.pushDelivery.createMany({
      data: [{ notificationId, subscriptionId, createdAt: at }],
      skipDuplicates: true,
    });
    if (created.count)
      await prisma.pushSubscription.updateMany({ where: { id: subscriptionId }, data: { lastSentAt: at } });
    return created.count === 1;
  },

  async unmarkDelivered(notificationId, subscriptionId) {
    await prisma.pushDelivery.deleteMany({ where: { notificationId, subscriptionId } });
  },

  async prefs(customerId) {
    const row = await prisma.customer.findUnique({ where: { id: customerId }, select: { notificationPrefs: true } });
    return row ? parsePrefs(row.notificationPrefs) : null;
  },

  async savePrefs(customerId, prefs) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { notificationPrefs: prefs },
      select: { id: true },
    });
  },
};
