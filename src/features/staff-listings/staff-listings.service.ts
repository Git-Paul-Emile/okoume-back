import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee, type Permission } from '../../core/security/permissions.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import { toReportDto, toStaffListingDto } from '../listings/listings.dto.js';
import {
  listingChangesMessage,
  listingHiddenMessage,
  listingPublishedMessage,
  listingRejectedMessage,
} from '../listings/listings.emails.js';
import type { ListingRecord, ListingsRepository, ListingStatus, NewReview } from '../listings/listings.repository.js';
import type { Notifier } from '../notifications/notifier.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import { notifySeller } from '../shops/shops.service.js';
import type { ListingDecisionInput, ListListingsQuery, ListReportsQuery } from './staff-listings.schemas.js';

export type StaffActor = Grantee & { id: string };

export interface StaffListingsDependencies {
  listings: ListingsRepository;
  shops: ShopsRepository;
  email: EmailSender;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

/** Pour chaque décision : depuis quels états, vers quel état, et le résultat enregistré dans l'historique. */
const DECISIONS: Record<
  ListingDecisionInput['decision'],
  { from: ListingStatus[]; to: ListingStatus; outcome: NewReview['outcome'] }
> = {
  approve: { from: ['pending_moderation', 'in_review', 'changes_requested'], to: 'published', outcome: 'approved' },
  request_changes: {
    from: ['pending_moderation', 'in_review', 'published'],
    to: 'changes_requested',
    outcome: 'changes_requested',
  },
  reject: {
    from: ['pending_moderation', 'in_review', 'changes_requested', 'published'],
    to: 'rejected',
    outcome: 'rejected',
  },
  hide: { from: ['published'], to: 'pending_moderation', outcome: 'moderation' },
};

/** Modération des annonces et des signalements (32.3, 13.3, 13.4) : vendeurs:consulter, décisions vendeurs:valider. */
export const createStaffListingsService = (deps: StaffListingsDependencies) => {
  const { listings, shops, now } = deps;

  function require(actor: Grantee, permission: Permission) {
    if (!can(actor, permission)) throw new ForbiddenError();
  }

  async function load(id: string) {
    const listing = await listings.findById(id);
    if (!listing) throw new NotFoundError('Annonce introuvable.');
    return listing;
  }

  async function view(listing: ListingRecord) {
    const [reviews, reports] = await Promise.all([
      listings.reviews(listing.id),
      listings.listReports({ listingId: listing.id, status: 'open', page: 1, limit: 1 }),
    ]);
    return toStaffListingDto(listing, reviews, reports.total);
  }

  return {
    async list(query: ListListingsQuery, actor: Grantee) {
      require(actor, 'vendeurs:consulter');
      const { items, total } = await listings.list({
        statuses: [query.status],
        shopId: query.shopId,
        page: query.page,
        limit: query.limit,
      });
      return paginate(await Promise.all(items.map(view)), total, query.page, query.limit);
    },

    async get(id: string, actor: Grantee) {
      require(actor, 'vendeurs:consulter');
      return view(await load(id));
    },

    /** La décision s'applique à la version consultée : si le vendeur a modifié l'annonce entre-temps, 409. */
    async decide(id: string, input: ListingDecisionInput, actor: StaffActor) {
      require(actor, 'vendeurs:valider');
      const listing = await load(id);
      const rule = DECISIONS[input.decision];
      const reason = input.decision === 'approve' ? null : input.reason;
      const applied = await listings.applyReview(
        listing.id,
        { version: listing.version, statuses: rule.from },
        { source: 'staff', outcome: rule.outcome, issues: [], reason, model: null, staffId: actor.id },
        rule.to,
        now(),
      );
      if (!applied) throw new ConflictError('L’annonce a changé entre-temps : rechargez-la avant de décider.');
      const owner = await shops.findOwner(listing.shop.ownerId);
      if (owner) {
        const message =
          input.decision === 'approve'
            ? listingPublishedMessage(owner, listing, deps.appUrl)
            : input.decision === 'request_changes'
              ? listingChangesMessage(owner, listing, deps.appUrl, [], input.reason)
              : input.decision === 'reject'
                ? listingRejectedMessage(owner, listing, deps.appUrl, input.reason)
                : listingHiddenMessage(owner, listing, deps.appUrl, input.reason);
        await notifySeller(deps, owner, message);
      }
      return view(await load(id));
    },

    async reports(query: ListReportsQuery, actor: Grantee) {
      require(actor, 'vendeurs:consulter');
      const { items, total } = await listings.listReports(query);
      return paginate(items.map(toReportDto), total, query.page, query.limit);
    },

    async decideReport(id: string, status: 'dismissed' | 'upheld', actor: StaffActor) {
      require(actor, 'vendeurs:valider');
      const report = await listings.decideReport(id, { status, staffId: actor.id, at: now() });
      if (report === null) throw new NotFoundError('Signalement introuvable.');
      if (report === 'stale') throw new ConflictError('Ce signalement a déjà été traité.');
      return toReportDto(report);
    },
  };
};

export type StaffListingsService = ReturnType<typeof createStaffListingsService>;
