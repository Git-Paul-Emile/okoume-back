import { z } from 'zod';
import { customerId } from './customers.seeder.js';
import { productId } from './products.seeder.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const reviews = z.array(
  z.object({
    id: z.string(),
    productId: z.string(),
    userId: z.string().nullable(),
    authorName: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    // Une note seule, sans commentaire, est un avis valable du prototype
    comment: z.string(),
    photos: z.array(z.string()).max(3),
    status: z.enum(['pending', 'approved', 'rejected']),
    rejectionReason: z.string().optional(),
    createdAt: isoDate,
  }),
);

/** Avis clients de démonstration affichés dans « Les mieux notés par nos clients ». */
export const loadReviews = () => readData('reviews.json', reviews);

const reviewId = (legacyId: string) => legacyUuid('review', legacyId);

/**
 * Avis clients de démonstration. Un signalement exige son auteur (un client) : ceux qui n'en ont pas dans les
 * données sont signalés et laissés de côté plutôt qu'attribués à un client au hasard.
 */
export const reviewsSeeder: Seeder = {
  name: 'reviews',
  demo: true,
  async run({ prisma }) {
    const data = loadReviews();
    const { count } = await prisma.productReview.createMany({
      data: data.map((r) => ({
        id: reviewId(r.id),
        productId: productId(r.productId),
        customerId: r.userId ? customerId(r.userId) : null,
        authorName: r.authorName,
        rating: r.rating,
        comment: r.comment,
        photos: r.photos,
        status: r.status,
        rejectionReason: r.status === 'rejected' ? (r.rejectionReason ?? 'Avis non conforme à la charte') : null,
        history: [{ at: r.createdAt.toISOString(), event: 'Avis déposé' }],
        createdAt: r.createdAt,
      })),
      skipDuplicates: true,
    });
    return count;
  },
};
