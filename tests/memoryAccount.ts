import { randomUUID } from 'node:crypto';
import {
  DEFAULT_MAX_ADDRESSES,
  type AccountRepository,
  type AddressRecord,
} from '../src/features/account/account.repository.js';
import type { CustomerRecord } from '../src/features/auth/auth.repository.js';
import type { ProductRecord } from '../src/features/products/products.repository.js';
import type { DeliveryZoneRecord } from '../src/features/delivery-zones/delivery-zones.repository.js';

/**
 * Compte client en mémoire, avec la sémantique de la base : adresses et favoris rattachés au client,
 * une seule adresse par défaut, plafonds vérifiés, favoris listés seulement s'ils sont encore en vente.
 */
export function createMemoryAccount(source: {
  customers: CustomerRecord[];
  products: ProductRecord[];
  zones: DeliveryZoneRecord[];
  now: () => Date;
}) {
  const addresses: Array<AddressRecord & { customerId: string }> = [];
  const favorites: Array<{ customerId: string; productId: string; createdAt: Date }> = [];
  const settings = { maxAddresses: DEFAULT_MAX_ADDRESSES };

  const own = (customerId: string) =>
    addresses
      .filter((a) => a.customerId === customerId)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.getTime() - b.createdAt.getTime());
  const strip = ({ customerId: _customerId, ...a }: AddressRecord & { customerId: string }): AddressRecord => {
    void _customerId;
    return { ...a };
  };

  const repository: AccountRepository = {
    async updateProfile(customerId, data) {
      const customer = source.customers.find((c) => c.id === customerId);
      if (!customer) throw new Error(`Client inconnu : ${customerId}`);
      return Object.assign(customer, data);
    },
    listAddresses: async (customerId) => own(customerId).map(strip),
    async createAddress(customerId, data) {
      const count = own(customerId).length;
      if (count >= settings.maxAddresses) return { limitReached: settings.maxAddresses };
      const created = { ...data, id: randomUUID(), customerId, isDefault: count === 0, createdAt: source.now() };
      addresses.push(created);
      return { created: strip(created) };
    },
    async updateAddress(customerId, id, { isDefault, ...data }) {
      const address = addresses.find((a) => a.id === id && a.customerId === customerId);
      if (!address) return null;
      if (isDefault) for (const a of own(customerId)) a.isDefault = a.id === id;
      return strip(Object.assign(address, data));
    },
    async deleteAddress(customerId, id) {
      const index = addresses.findIndex((a) => a.id === id && a.customerId === customerId);
      if (index < 0) return false;
      const [removed] = addresses.splice(index, 1);
      const [next] = own(customerId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      if (removed?.isDefault && next) next.isDefault = true;
      return true;
    },
    zoneExists: async (zoneId) => source.zones.some((z) => z.id === zoneId),
    listFavorites: async (customerId) =>
      favorites
        .filter(
          (f) =>
            f.customerId === customerId &&
            source.products.some((p) => p.id === f.productId && p.status === 'published'),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((f) => f.productId),
    async addFavorite(customerId, productId, max) {
      const mine = favorites.filter((f) => f.customerId === customerId);
      if (mine.some((f) => f.productId === productId)) return true;
      if (mine.length >= max) return false;
      favorites.push({ customerId, productId, createdAt: source.now() });
      return true;
    },
    async removeFavorite(customerId, productId) {
      const index = favorites.findIndex((f) => f.customerId === customerId && f.productId === productId);
      if (index >= 0) favorites.splice(index, 1);
    },
    productPublished: async (productId) => source.products.some((p) => p.id === productId && p.status === 'published'),
  };

  return { repository, addresses, favorites, settings };
}
