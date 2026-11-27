import { NotFoundError, UnauthorizedError, UnprocessableError } from '../../core/errors/AppError.js';
import { toCustomerDto } from '../auth/auth.dto.js';
import type { CustomersRepository } from '../auth/auth.repository.js';
import type { AccountRepository, AddressRecord } from './account.repository.js';
import type { CreateAddressInput, ProfileInput, UpdateAddressInput } from './account.schemas.js';

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
 * Compte du client connecté : identité et adresses de livraison.
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

  };
};

export type AccountService = ReturnType<typeof createAccountService>;
