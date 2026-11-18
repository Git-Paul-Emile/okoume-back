import { NotFoundError, UnauthorizedError, UnprocessableError } from '../../core/errors/AppError.js';
import { toCustomerDto } from '../auth/auth.dto.js';
import type { CustomersRepository } from '../auth/auth.repository.js';
import type { AccountRepository, AddressRecord } from './account.repository.js';
import type { CreateAddressInput, ProfileInput, UpdateAddressInput } from './account.schemas.js';

/** Favoris conservés par compte : au-delà, le client en retire avant d'en ajouter. */
export const MAX_FAVORITES = 200;

export const toAddressDto = (a: AddressRecord) => ({
  id: a.id,
  label: a.label,
  recipient: a.recipient,
  phone: a.phone,
  zoneId: a.zoneId,
  landmark: a.landmark,
  instructions: a.instructions,
  isDefault: a.isDefault,
  createdAt: a.createdAt.toISOString(),
});

export type AddressDto = ReturnType<typeof toAddressDto>;

const ADDRESS_NOT_FOUND = 'Adresse introuvable.';
const UNKNOWN_ZONE = 'Ce quartier n’est pas desservi. Choisissez-en un dans la liste.';

/**
 * Compte du client connecté : identité, adresses de livraison (2.2), favoris (3.6).
 * Chaque opération porte sur le compte de la session : un client ne touche jamais aux données d'un autre.
 */
export const createAccountService = (deps: { customers: CustomersRepository; account: AccountRepository }) => {
  const { customers, account } = deps;

  async function activeCustomer(customerId: string) {
    const customer = await customers.findById(customerId);
    if (!customer || customer.status !== 'active') throw new UnauthorizedError();
    return customer;
  }

  async function checkZone(zoneId: string | undefined) {
    if (zoneId !== undefined && !(await account.zoneExists(zoneId))) throw new UnprocessableError(UNKNOWN_ZONE);
  }

  return {
    async updateProfile(customerId: string, input: ProfileInput) {
      await activeCustomer(customerId);
      return toCustomerDto(await account.updateProfile(customerId, input));
    },

    async addresses(customerId: string) {
      await activeCustomer(customerId);
      return (await account.listAddresses(customerId)).map(toAddressDto);
    },

    async addAddress(customerId: string, input: CreateAddressInput) {
      await activeCustomer(customerId);
      await checkZone(input.zoneId);
      const result = await account.createAddress(customerId, input);
      if ('limitReached' in result)
        throw new UnprocessableError(
          `${result.limitReached} adresses au maximum : supprimez-en une avant d’en ajouter.`,
        );
      return toAddressDto(result.created);
    },

    async updateAddress(customerId: string, id: string, input: UpdateAddressInput) {
      await activeCustomer(customerId);
      await checkZone(input.zoneId);
      const updated = await account.updateAddress(customerId, id, input);
      if (!updated) throw new NotFoundError(ADDRESS_NOT_FOUND);
      return toAddressDto(updated);
    },

    async removeAddress(customerId: string, id: string) {
      await activeCustomer(customerId);
      if (!(await account.deleteAddress(customerId, id))) throw new NotFoundError(ADDRESS_NOT_FOUND);
    },

    async favorites(customerId: string) {
      await activeCustomer(customerId);
      return account.listFavorites(customerId);
    },

    /** Idempotent : ajouter un favori déjà présent ne change rien. */
    async addFavorite(customerId: string, productId: string) {
      await activeCustomer(customerId);
      if (!(await account.productPublished(productId))) throw new NotFoundError('Produit introuvable.');
      if (!(await account.addFavorite(customerId, productId, MAX_FAVORITES)))
        throw new UnprocessableError(`${MAX_FAVORITES} favoris au maximum : retirez-en avant d’en ajouter.`);
    },

    /** Idempotent : retirer un favori absent ne change rien. */
    async removeFavorite(customerId: string, productId: string) {
      await activeCustomer(customerId);
      await account.removeFavorite(customerId, productId);
    },
  };
};

export type AccountService = ReturnType<typeof createAccountService>;
