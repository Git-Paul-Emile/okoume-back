import type { ListingReviewer, ReviewVerdict } from '../../infrastructure/ai/listingReviewer.js';
import type { EmailSender } from '../../infrastructure/email/emailSender.js';
import type { Notifier } from '../notifications/notifier.js';
import type { ShopsRepository } from '../shops/shops.repository.js';
import { notifySeller } from '../shops/shops.service.js';
import { listingChangesMessage, listingPublishedMessage } from './listings.emails.js';
import type { ListingRecord, ListingsRepository, ListingStatus, NewReview } from './listings.repository.js';
import { startOfMonth } from './listings.rules.js';

export interface ListingReviewDependencies {
  listings: ListingsRepository;
  shops: ShopsRepository;
  reviewer: ListingReviewer;
  email: EmailSender;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

const NEXT_STATUS: Record<ReviewVerdict['outcome'], ListingStatus> = {
  approved: 'published',
  changes_requested: 'changes_requested',
  moderation: 'pending_moderation',
};

/**
 * Vérification assistée des annonces soumises (32.3), exécutée par le worker. L'avis ne s'applique qu'à la
 * version examinée ; l'IA publie, demande une correction ou transmet à une personne, jamais un refus.
 */
export const createListingReviewWorker = (deps: ListingReviewDependencies) => {
  const { listings, shops, reviewer, now } = deps;

  async function apply(listing: ListingRecord, version: number, review: NewReview) {
    const next = NEXT_STATUS[review.outcome === 'rejected' ? 'moderation' : review.outcome];
    const applied = await listings.applyReview(listing.id, { version, statuses: ['in_review'] }, review, next, now());
    if (!applied) return;
    if (next === 'pending_moderation') {
      await deps.notifier.notifyStaff('vendeurs:valider', {
        title: 'Annonce à examiner',
        body: listing.title,
        url: `${deps.appUrl}/admin/annonces/${listing.id}`,
        tag: `moderation-${listing.id}`,
      });
      return;
    }
    const owner = await shops.findOwner(listing.shop.ownerId);
    if (!owner) return;
    await notifySeller(
      deps,
      owner,
      next === 'published'
        ? listingPublishedMessage(owner, listing, deps.appUrl)
        : listingChangesMessage(owner, listing, deps.appUrl, review.issues, null),
    );
  }

  return {
    /**
     * Une panne passagère du fournisseur est levée (ReviewUnavailableError) : la file reprend la vérification.
     * Au-delà du plafond mensuel (16.6), l'annonce va directement en modération humaine, sans appel au modèle.
     */
    async review(listingId: string, version: number) {
      const listing = await listings.findById(listingId);
      if (!listing || listing.status !== 'in_review' || listing.version !== version) return;
      const { aiReviewMonthlyLimit } = await shops.settings();
      if ((await listings.aiReviewCount(startOfMonth(now()))) >= aiReviewMonthlyLimit) {
        await apply(listing, version, {
          source: 'ai',
          outcome: 'moderation',
          issues: [],
          reason: 'Plafond mensuel de vérification automatique atteint',
          model: null,
          staffId: null,
        });
        return;
      }
      const verdict = await reviewer.review({
        title: listing.title,
        description: listing.description,
        category: listing.category.label,
        kind: listing.kind,
        condition: listing.condition,
        price: listing.price,
        quantity: listing.quantity,
        city: listing.city,
        district: listing.district,
        photoUrls: listing.photos,
      });
      await apply(listing, version, {
        source: 'ai',
        outcome: verdict.outcome,
        issues: verdict.issues,
        reason: null,
        model: verdict.model,
        staffId: null,
      });
    },

    /** Toutes les reprises ont échoué : l'annonce n'attend pas indéfiniment, une personne l'examine. */
    async fallbackToModeration(listingId: string, version: number) {
      const listing = await listings.findById(listingId);
      if (!listing || listing.status !== 'in_review' || listing.version !== version) return;
      await apply(listing, version, {
        source: 'ai',
        outcome: 'moderation',
        issues: [],
        reason: 'Vérification automatique indisponible',
        model: null,
        staffId: null,
      });
    },
  };
};

export type ListingReviewWorker = ReturnType<typeof createListingReviewWorker>;
