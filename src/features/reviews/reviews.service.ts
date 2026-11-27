import {
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  UnprocessableError,
} from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { MediaStorage } from '../../infrastructure/media/mediaStorage.js';
import type { CustomersRepository } from '../auth/auth.repository.js';
import type { ReviewRecord, ReviewsRepository } from './reviews.repository.js';
import type { DecideReviewInput, ListStaffReviewsQuery, ReviewInput } from './reviews.schemas.js';

/** Vue publique : ni le compte de l'auteur ni l'historique de modération. */
export const toPublicReviewDto = (r: ReviewRecord) => ({
  id: r.id,
  productId: r.productId,
  authorName: r.authorName,
  rating: r.rating,
  comment: r.comment,
  photos: r.photos,
  createdAt: r.createdAt.toISOString(),
});

/** Vue de l'auteur : son avis avec son statut et le motif d'un refus. */
export const toOwnReviewDto = (r: ReviewRecord) => ({
  ...toPublicReviewDto(r),
  customerId: r.customerId,
  status: r.status,
  rejectionReason: r.rejectionReason,
  history: r.history,
});

/** Vue de l'équipe : avis, produit et historique de modération. */
export const toStaffReviewDto = (r: ReviewRecord) => ({
  ...toOwnReviewDto(r),
  productName: r.productName,
});

export interface ReviewsDependencies {
  reviews: ReviewsRepository;
  customers: Pick<CustomersRepository, 'findById'>;
  media: MediaStorage | null;
  now: () => Date;
}

/**
 * Avis clients : un avis par produit reçu, modifiable, publié après modération. Lecture clients:consulter,
 * décision clients:modifier.
 */
export const createReviewsService = (deps: ReviewsDependencies) => {
  const { reviews, customers, media, now } = deps;

  async function author(customerId: string) {
    const customer = await customers.findById(customerId);
    if (!customer || customer.status !== 'active') throw new UnauthorizedError();
    // Prénom et initiale : jamais le nom complet sur une page publique
    return `${customer.firstName} ${customer.lastName.charAt(0)}.`;
  }

  function require(actor: Grantee, write: boolean) {
    if (!can(actor, write ? 'clients:modifier' : 'clients:consulter')) throw new ForbiddenError();
  }

  return {
    signPhotoUpload() {
      if (!media) throw new ServiceUnavailableError('L’envoi de photos n’est pas encore configuré.');
      const upload = media.signUpload('reviews', now());
      return { ...upload, expiresAt: upload.expiresAt.toISOString() };
    },

    async forProduct(productId: string, page: { page: number; limit: number }) {
      const { items, total } = await reviews.listApproved(productId, page);
      return paginate(items.map(toPublicReviewDto), total, page.page, page.limit);
    },

    ratings: () => reviews.ratings(),

    async mine(customerId: string, productId: string) {
      const review = await reviews.findMine(customerId, productId);
      return review ? toOwnReviewDto(review) : null;
    },

    /** Dépôt ou modification de son avis : réservé à un produit reçu ; il repasse toujours en modération. */
    async save(customerId: string, productId: string, input: ReviewInput) {
      const authorName = await author(customerId);
      const existing = await reviews.findMine(customerId, productId);
      if (!existing && !(await reviews.hasReceived(customerId, productId)))
        throw new ForbiddenError('Vous pourrez donner votre avis une fois ce produit reçu.');
      if (input.photos.length && (!media || input.photos.some((url) => !media.isHostedUrl(url))))
        throw new UnprocessableError('Ajoutez les photos depuis ce formulaire.');
      const saved = await reviews.save(customerId, productId, authorName, input, {
        at: now().toISOString(),
        event: 'Avis déposé',
      });
      return toOwnReviewDto(saved);
    },

    async list(query: ListStaffReviewsQuery, actor: Grantee) {
      require(actor, false);
      const { items, total } = await reviews.list(query);
      return paginate(items.map(toStaffReviewDto), total, query.page, query.limit);
    },

    async decide(id: string, input: DecideReviewInput, actor: Grantee & { id: string }) {
      require(actor, true);
      const staffName = (await reviews.staffName(actor.id)) ?? 'l’équipe';
      const decision =
        input.status === 'approved'
          ? { status: 'approved' as const, rejectionReason: null }
          : {
              status: 'rejected' as const,
              rejectionReason: input.detail ? `${input.rejectionReason} (${input.detail})` : input.rejectionReason,
            };
      const updated = await reviews.decide(id, decision, {
        at: now().toISOString(),
        event:
          decision.status === 'approved'
            ? `Publié par ${staffName}`
            : `Non publié par ${staffName} : ${decision.rejectionReason}`,
      });
      if (!updated) throw new NotFoundError('Avis introuvable.');
      return toStaffReviewDto(updated);
    },
  };
};

export type ReviewsService = ReturnType<typeof createReviewsService>;
