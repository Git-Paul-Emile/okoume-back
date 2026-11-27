import { prisma } from '../../lib/prisma.js';
import { customerColumns, type CustomerRecord } from '../auth/auth.repository.js';
import type { CreateAddressInput, UpdateAddressInput } from './account.schemas.js';

/** Valeur de la colonne shop_settings.max_addresses quand la ligne de réglages n'existe pas encore. */
export const DEFAULT_MAX_ADDRESSES = 5;

export interface AddressRecord {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  zoneId: string;
  landmark: string;
  instructions: string;
  isDefault: boolean;
  createdAt: Date;
}

const addressColumns = {
  id: true,
  label: true,
  recipient: true,
  phone: true,
  zoneId: true,
  landmark: true,
  instructions: true,
  isDefault: true,
  createdAt: true,
} as const;

/** Adresse par défaut en tête, puis par ancienneté. */
const addressOrder = [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }];

/** Résultat d'un ajout soumis au plafond d'adresses, décidé sous verrou. */
export type CreateAddressResult = { created: AddressRecord } | { limitReached: number };

/** Contrat de stockage du compte client : identité et adresses. */
export interface AccountRepository {
  updateProfile(customerId: string, data: { firstName?: string; lastName?: string }): Promise<CustomerRecord>;
  listAddresses(customerId: string): Promise<AddressRecord[]>;
  createAddress(customerId: string, data: Required<CreateAddressInput>): Promise<CreateAddressResult>;
  updateAddress(customerId: string, id: string, data: UpdateAddressInput): Promise<AddressRecord | null>;
  deleteAddress(customerId: string, id: string): Promise<boolean>;
  zoneExists(zoneId: string): Promise<boolean>;
}

export const accountRepository: AccountRepository = {
  updateProfile: (customerId, data) =>
    prisma.customer.update({ where: { id: customerId }, data, select: customerColumns }),

  listAddresses: (customerId) =>
    prisma.customerAddress.findMany({ where: { customerId }, select: addressColumns, orderBy: addressOrder }),

  /**
   * Ajout sous verrou de la ligne du client : deux ajouts simultanés ne dépassent pas le plafond.
   * La première adresse devient l'adresse par défaut.
   */
  createAddress: (customerId, data) =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId}::uuid FOR UPDATE`;
      const [count, settings] = await Promise.all([
        tx.customerAddress.count({ where: { customerId } }),
        tx.shopSettings.findUnique({ where: { id: 1 }, select: { maxAddresses: true } }),
      ]);
      const max = settings?.maxAddresses ?? DEFAULT_MAX_ADDRESSES;
      if (count >= max) return { limitReached: max };
      const created = await tx.customerAddress.create({
        data: { ...data, customerId, isDefault: count === 0 },
        select: addressColumns,
      });
      return { created };
    }),

  /** L'adresse doit appartenir au client (protection IDOR) ; une seule adresse par défaut à la fois. */
  updateAddress: (customerId, id, { isDefault, ...data }) =>
    prisma.$transaction(async (tx) => {
      const owned = await tx.customerAddress.findFirst({ where: { id, customerId }, select: { id: true } });
      if (!owned) return null;
      if (isDefault)
        await tx.customerAddress.updateMany({ where: { customerId, isDefault: true }, data: { isDefault: false } });
      return tx.customerAddress.update({
        where: { id },
        data: { ...data, ...(isDefault ? { isDefault: true } : {}) },
        select: addressColumns,
      });
    }),

  /** Suppression ; si c'était l'adresse par défaut, la plus ancienne restante prend le relais. */
  deleteAddress: (customerId, id) =>
    prisma.$transaction(async (tx) => {
      const removed = await tx.customerAddress.findFirst({ where: { id, customerId }, select: { isDefault: true } });
      if (!removed) return false;
      await tx.customerAddress.delete({ where: { id } });
      if (removed.isDefault) {
        const next = await tx.customerAddress.findFirst({
          where: { customerId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
      return true;
    }),

  zoneExists: async (zoneId) =>
    !!(await prisma.deliveryZone.findUnique({ where: { id: zoneId }, select: { id: true } })),
};
