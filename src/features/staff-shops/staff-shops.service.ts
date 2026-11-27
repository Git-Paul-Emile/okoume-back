import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee, type Permission } from '../../core/security/permissions.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import type { Notifier } from '../notifications/notifier.js';
import { toShopDto } from '../shops/shops.dto.js';
import { suspensionMessage } from '../shops/shops.emails.js';
import type { ShopRecord, ShopsRepository } from '../shops/shops.repository.js';
import { notifySeller } from '../shops/shops.service.js';
import type { ListShopsQuery, ShopActionInput } from './staff-shops.schemas.js';

export type StaffActor = Grantee & { id: string };

export interface StaffShopsDependencies {
  shops: ShopsRepository;
  email: EmailSender;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

export const createStaffShopsService = (deps: StaffShopsDependencies) => {
  const { shops, now } = deps;
  const require = (actor: Grantee, permission: Permission) => {
    if (!can(actor, permission)) throw new ForbiddenError();
  };

  async function ownerOf(shop: ShopRecord) {
    const owner = await shops.findOwner(shop.ownerId);
    if (!owner) throw new Error(`Propriétaire de boutique ${shop.ownerId} introuvable`);
    return owner;
  }

  return {
    async list(query: ListShopsQuery, actor: Grantee) {
      require(actor, 'vendeurs:consulter');
      const { items, total } = await shops.list(query);
      return paginate(items.map(toShopDto), total, query.page, query.limit);
    },

    async get(id: string, actor: Grantee) {
      require(actor, 'vendeurs:consulter');
      const shop = await shops.findById(id);
      if (!shop) throw new NotFoundError('Boutique introuvable.');
      return toShopDto(shop);
    },

    async act(id: string, input: ShopActionInput, actor: StaffActor) {
      require(actor, 'vendeurs:valider');
      if (!(await shops.findById(id))) throw new NotFoundError('Boutique introuvable.');
      let shop: ShopRecord | null;
      switch (input.action) {
        case 'suspend':
          shop = await shops.suspend(id, { reason: input.reason, staffId: actor.id, at: now() });
          if (!shop) throw new ConflictError('Cette boutique est déjà suspendue.');
          break;
        case 'reinstate':
          shop = await shops.reinstate(id);
          if (!shop) throw new ConflictError('Cette boutique n’est pas suspendue.');
          break;
        case 'verify':
        case 'unverify':
          shop = await shops.setVerified(id, input.action === 'verify' ? { staffId: actor.id, at: now() } : null);
          if (!shop) throw new NotFoundError('Boutique introuvable.');
          break;
      }
      const owner = await ownerOf(shop);
      await notifySeller(deps, owner, suspensionMessage(owner, shop, deps.appUrl));
      return toShopDto(shop);
    },
  };
};

export type StaffShopsService = ReturnType<typeof createStaffShopsService>;
