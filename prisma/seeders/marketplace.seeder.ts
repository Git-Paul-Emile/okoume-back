import { z } from 'zod';
import { categoryId } from './categories.seeder.js';
import { customerId, loadCustomers } from './customers.seeder.js';
import { shopId, loadShops } from './shops.seeder.js';
import { staffId } from './staff.seeder.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const status = z.enum([
  'draft',
  'in_review',
  'changes_requested',
  'pending_moderation',
  'published',
  'rejected',
  'withdrawn',
  'sold',
]);
const condition = z.enum(['new', 'like_new', 'good', 'used']);

const listingSchema = z.object({
  id: z.string(),
  shopId: z.string(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  categoryId: z.string(),
  kind: z.enum(['product', 'service']),
  condition: condition.nullable(),
  price: z.number().int().positive(),
  minPrice: z.number().int().positive().nullable(),
  sellerNotes: z.string(),
  quantity: z.number().int().min(0).nullable(),
  city: z.string().min(1),
  district: z.string().min(1),
  status,
  version: z.number().int().min(0),
  submittedAt: isoDate.nullable(),
  publishedAt: isoDate.nullable(),
  createdAt: isoDate,
  photos: z.array(z.string()).max(8),
});

const schema = z.object({
  listings: z.array(listingSchema),
  reviews: z.array(
    z.object({
      id: z.string(),
      listingId: z.string(),
      version: z.number().int().min(0),
      source: z.enum(['ai', 'staff']),
      outcome: z.enum(['approved', 'changes_requested', 'moderation', 'rejected']),
      issues: z.array(z.object({ field: z.string(), message: z.string() })),
      reason: z.string().optional(),
      staffId: z.string().optional(),
      createdAt: isoDate,
    }),
  ),
  reports: z.array(
    z.object({
      id: z.string(),
      listingId: z.string(),
      reporterId: z.string(),
      reason: z.enum([
        'prohibited',
        'scam',
        'misleading',
        'offensive',
        'personal_data',
        'inappropriate_photos',
        'spam',
        'other',
      ]),
      comment: z.string(),
      status: z.enum(['open', 'dismissed', 'upheld']),
      decidedById: z.string().optional(),
      decidedAt: isoDate.optional(),
      createdAt: isoDate,
    }),
  ),
  requests: z.array(
    z.object({
      id: z.string(),
      number: z.string().min(1),
      listingId: z.string(),
      buyerId: z.string(),
      quantity: z.number().int().positive().nullable(),
      unitPrice: z.number().int().positive(),
      paymentMethod: z.enum(['cash', 'airtel', 'moov']),
      handover: z.enum(['pickup', 'seller_delivery']),
      status: z.enum(['sent', 'accepted', 'refused', 'cancelled', 'concluded', 'not_concluded']),
      reason: z.string().optional(),
      message: z.string(),
      createdAt: isoDate,
      events: z.array(
        z.object({
          status: z.enum(['sent', 'accepted', 'refused', 'cancelled', 'concluded', 'not_concluded']),
          actor: z.enum(['buyer', 'seller']),
          note: z.string().optional(),
          createdAt: isoDate,
        }),
      ),
    }),
  ),
  conversations: z.array(
    z.object({
      id: z.string(),
      listingId: z.string(),
      buyerId: z.string(),
      status: z.enum(['open', 'closed']),
      needsSeller: z.boolean(),
      agreedPrice: z.number().int().positive().nullable(),
      agreementExpiresAt: isoDate.nullable(),
      createdAt: isoDate,
      lastMessageAt: isoDate,
      messages: z.array(
        z.object({
          id: z.string(),
          author: z.enum(['buyer', 'assistant', 'seller', 'system']),
          body: z.string().min(1),
          replyToId: z.string().optional(),
          model: z.string().optional(),
          createdAt: isoDate,
        }),
      ),
    }),
  ),
  views: z.array(z.object({ listingId: z.string(), day: isoDate, count: z.number().int().positive() })),
});

export const loadMarketplaceData = () => readData('marketplace.json', schema);
const listingId = (id: string) => legacyUuid('listing', id);

/** Annonces, modération, demandes, tchat et signalements de la place de marché entre particuliers. */
export const marketplaceSeeder: Seeder = {
  name: 'marketplace-listings',
  demo: true,
  async run({ prisma }) {
    const data = loadMarketplaceData();
    const shops = new Map(loadShops().map((shop) => [shop.id, shop]));
    const customers = new Map(loadCustomers().map((customer) => [customer.id, customer]));
    const listingById = new Map(data.listings.map((listing) => [listing.id, listing]));

    const { count } = await prisma.listing.createMany({
      data: data.listings.map((listing) => ({
        id: listingId(listing.id),
        shopId: shopId(listing.shopId),
        slug: listing.slug,
        title: listing.title,
        description: listing.description,
        categoryId: categoryId(listing.categoryId),
        kind: listing.kind,
        condition: listing.condition,
        price: listing.price,
        minPrice: listing.minPrice,
        sellerNotes: listing.sellerNotes,
        quantity: listing.quantity,
        city: listing.city,
        district: listing.district,
        status: listing.status,
        version: listing.version,
        submittedAt: listing.submittedAt,
        publishedAt: listing.publishedAt,
        createdAt: listing.createdAt,
      })),
      skipDuplicates: true,
    });

    await prisma.listingPhoto.createMany({
      data: data.listings.flatMap((listing) =>
        listing.photos.map((url, position) => ({
          id: legacyUuid('listing-photo', `${listing.id}:${position}`),
          listingId: listingId(listing.id),
          url,
          position,
        })),
      ),
      skipDuplicates: true,
    });
    await prisma.listingReview.createMany({
      data: data.reviews.map((review) => ({
        id: legacyUuid('listing-review', review.id),
        listingId: listingId(review.listingId),
        version: review.version,
        source: review.source,
        outcome: review.outcome,
        issues: review.issues,
        reason: review.reason ?? null,
        staffId: review.staffId ? staffId(review.staffId) : null,
        createdAt: review.createdAt,
      })),
      skipDuplicates: true,
    });
    await prisma.listingReport.createMany({
      data: data.reports.map((report) => ({
        id: legacyUuid('listing-report', report.id),
        listingId: listingId(report.listingId),
        reporterId: customerId(report.reporterId),
        reason: report.reason,
        comment: report.comment,
        status: report.status,
        decidedById: report.decidedById ? staffId(report.decidedById) : null,
        decidedAt: report.decidedAt ?? null,
        createdAt: report.createdAt,
      })),
      skipDuplicates: true,
    });

    const requests = data.requests.map((request) => {
      const listing = listingById.get(request.listingId);
      const shop = listing ? shops.get(listing.shopId) : null;
      const buyer = customers.get(request.buyerId);
      if (!listing || !shop || !buyer) throw new Error(`marketplace.json : relation absente pour ${request.id}`);
      const quantity = request.quantity ?? 1;
      return { request, listing, shop, buyer, total: request.unitPrice * quantity };
    });
    await prisma.listingRequest.createMany({
      data: requests.map(({ request, listing, shop, buyer, total }) => ({
        id: legacyUuid('listing-request', request.id),
        number: request.number,
        listingId: listingId(listing.id),
        shopId: shopId(shop.id),
        buyerId: customerId(buyer.id),
        listingTitle: listing.title,
        quantity: request.quantity,
        unitPrice: request.unitPrice,
        total,
        paymentMethod: request.paymentMethod,
        handover: request.handover,
        contactPhone: buyer.phone ?? '+241 060000000',
        message: request.message,
        status: request.status,
        reason: request.reason ?? null,
        createdAt: request.createdAt,
      })),
      skipDuplicates: true,
    });
    await prisma.listingRequestEvent.createMany({
      data: requests.flatMap(({ request }) =>
        request.events.map((event, index) => ({
          id: legacyUuid('listing-request-event', `${request.id}:${index}`),
          requestId: legacyUuid('listing-request', request.id),
          status: event.status,
          actor: event.actor,
          note: event.note ?? null,
          createdAt: event.createdAt,
        })),
      ),
      skipDuplicates: true,
    });

    const conversations = data.conversations.map((conversation) => {
      const listing = listingById.get(conversation.listingId);
      const shop = listing ? shops.get(listing.shopId) : null;
      if (!listing || !shop || !customers.has(conversation.buyerId))
        throw new Error(`marketplace.json : relation absente pour ${conversation.id}`);
      return { conversation, listing, shop };
    });
    await prisma.conversation.createMany({
      data: conversations.map(({ conversation, listing, shop }) => ({
        id: legacyUuid('conversation', conversation.id),
        listingId: listingId(listing.id),
        shopId: shopId(shop.id),
        buyerId: customerId(conversation.buyerId),
        status: conversation.status,
        needsSeller: conversation.needsSeller,
        agreedPrice: conversation.agreedPrice,
        agreementExpiresAt: conversation.agreementExpiresAt,
        lastMessageAt: conversation.lastMessageAt,
        createdAt: conversation.createdAt,
      })),
      skipDuplicates: true,
    });
    await prisma.chatMessage.createMany({
      data: conversations.flatMap(({ conversation }) =>
        conversation.messages.map((message) => ({
          id: legacyUuid('chat-message', message.id),
          conversationId: legacyUuid('conversation', conversation.id),
          author: message.author,
          body: message.body,
          replyToId: message.replyToId ? legacyUuid('chat-message', message.replyToId) : null,
          model: message.model ?? null,
          createdAt: message.createdAt,
        })),
      ),
      skipDuplicates: true,
    });
    await prisma.listingView.createMany({
      data: data.views.map((view) => ({
        listingId: listingId(view.listingId),
        day: view.day,
        count: view.count,
      })),
      skipDuplicates: true,
    });
    return count;
  },
};
