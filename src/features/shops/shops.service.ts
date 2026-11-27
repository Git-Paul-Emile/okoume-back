import { ConflictError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { randomReadableCode } from '../../core/security/secrets.js';
import { slugify } from '../../core/text/slugify.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import { logger } from '../../lib/logger.js';
import type { Notifier } from '../notifications/notifier.js';
import { toPublicShopDto, toShopDto } from './shops.dto.js';
import type { OwnerRecord, ShopsRepository } from './shops.repository.js';
import { type OpenShopInput, type PageQuery, type UpdateShopInput } from './shops.schemas.js';

const SLUG_ATTEMPTS = 5;

export interface SellerMessage {
  email: Parameters<EmailSender['send']>[0];
  push: Parameters<Notifier['notifyCustomer']>[2];
}

export interface ShopsDependencies {
  shops: ShopsRepository;
  email: EmailSender;
  notifier: Notifier;
  appUrl: string;
}

export async function notifySeller(
  { email, notifier }: Pick<ShopsDependencies, 'email' | 'notifier'>,
  owner: Pick<OwnerRecord, 'id'>,
  message: SellerMessage,
  topic: 'shop' | 'orders' = 'shop',
) {
  try {
    await email.send(message.email);
  } catch (err) {
    logger.error({ err, customerId: owner.id }, 'E-mail au vendeur non déposé');
  }
  await notifier.notifyCustomer(owner.id, topic, message.push);
}

export const createShopsService = ({ shops }: ShopsDependencies) => {
  async function own(customerId: string) {
    const shop = await shops.findByOwner(customerId);
    if (!shop) throw new NotFoundError('Vous n’avez pas encore de boutique.');
    return shop;
  }

  return {
    async open(customerId: string, input: OpenShopInput) {
      const owner = await shops.findOwner(customerId);
      if (!owner || owner.status === 'anonymized')
        throw new UnprocessableError('Votre compte ne peut pas ouvrir de boutique.');
      const base = slugify(input.name) || 'boutique';
      for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
        const result = await shops.create({
          ownerId: customerId,
          slug: attempt === 0 ? base : `${base}-${randomReadableCode(4).toLowerCase()}`,
          name: input.name,
          description: input.description,
          city: input.city,
          district: input.district,
          latitude: input.position?.latitude ?? null,
          longitude: input.position?.longitude ?? null,
          phone: input.phone,
          acceptedPaymentMethods: input.acceptedPaymentMethods,
        });
        if (result === 'owner_taken') throw new ConflictError('Vous avez déjà une boutique.');
        if (result !== 'slug_taken') return toShopDto(result);
      }
      throw new Error('Impossible d’attribuer une adresse unique à la boutique.');
    },

    async mine(customerId: string) {
      return toShopDto(await own(customerId));
    },

    async update(customerId: string, input: UpdateShopInput) {
      const shop = await own(customerId);
      const { position, ...fields } = input;
      const updated = await shops.update(shop.id, {
        ...fields,
        ...(position !== undefined
          ? { latitude: position?.latitude ?? null, longitude: position?.longitude ?? null }
          : {}),
      });
      return toShopDto(updated);
    },

    async publicShop(slug: string) {
      const shop = await shops.findBySlug(slug);
      if (!shop || shop.status !== 'active') throw new NotFoundError('Boutique introuvable.');
      return toPublicShopDto(shop);
    },

    async publicList(query: PageQuery) {
      const { items, total } = await shops.listPublic(query);
      return paginate(items.map(toPublicShopDto), total, query.page, query.limit);
    },
  };
};

export type ShopsService = ReturnType<typeof createShopsService>;
