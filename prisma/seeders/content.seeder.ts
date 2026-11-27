import { z } from 'zod';
import { productId } from './products.seeder.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const banners = z.array(
  z.object({
    id: z.string(),
    title: z.string().min(1),
    subtitle: z.string(),
    cta: z.string().min(1),
    href: z.string().min(1),
    image: z.string().min(1),
    accent: z.enum(['forest', 'mure']),
  }),
);

const ads = z.array(
  z.object({
    id: z.string(),
    placement: z.enum(['home-promo', 'home-promo-side']),
    advertiser: z.string().nullable(),
    startsAt: isoDate.nullable(),
    endsAt: isoDate.nullable(),
    priority: z.number().int(),
    image: z.string().min(1),
    imageMobile: z.string().nullable(),
    alt: z.string().min(1),
    href: z.string().min(1),
    active: z.boolean(),
  }),
);

const offers = z.array(
  z.object({
    id: z.string(),
    label: z.string().min(1),
    title: z.string().min(1),
    productId: z.string(),
    href: z.string().nullable(),
    active: z.boolean(),
    order: z.number().int(),
  }),
);

export const loadContent = () => ({
  banners: readData('banners.json', banners),
  ads: readData('ads.json', ads),
  offers: readData('offers.json', offers),
});

/** Données gardées pour les promotions éditoriales, offres exclusives et espaces publicitaires. */
export const contentSeeder: Seeder = {
  name: 'content',
  demo: true,
  async run({ prisma }) {
    const data = loadContent();
    const banner = await prisma.homeBanner.createMany({
      data: data.banners.map(({ id, ...values }, position) => ({
        id: legacyUuid('banner', id),
        ...values,
        position,
      })),
      skipDuplicates: true,
    });
    const ad = await prisma.ad.createMany({
      data: data.ads.map(({ id, ...values }) => ({ id: legacyUuid('ad', id), ...values })),
      skipDuplicates: true,
    });
    const offer = await prisma.exclusiveOffer.createMany({
      data: data.offers.map(({ id, order, productId: legacy, ...values }) => ({
        id: legacyUuid('offer', id),
        ...values,
        productId: productId(legacy),
        position: order,
      })),
      skipDuplicates: true,
    });
    return banner.count + ad.count + offer.count;
  },
};
