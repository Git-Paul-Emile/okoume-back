import { z } from 'zod';

export const AD_PLACEMENTS = ['home-promo', 'home-promo-side'] as const;
/** Pages légales modifiables : leurs adresses sur le site */
export const LEGAL_SLUGS = ['cgv', 'confidentialite', 'mentions', 'retours'] as const;

/** Lien interne (/catalogue…) ou adresse HTTPS : jamais javascript: ni http en clair. */
const link = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^\/(?!\/)/.test(v) || /^https:\/\/[^\s]+$/.test(v), 'Lien interne (/…) ou adresse https:// attendu.');
/** Visuel : fichier du site (/ads/…) ou image hébergée en HTTPS */
const image = link;

export const updateBannerBody = z
  .strictObject({
    title: z.string().trim().min(3).max(80),
    subtitle: z.string().trim().max(200),
    cta: z.string().trim().min(2).max(40),
    href: link,
    image,
    accent: z.enum(['forest', 'mure']),
    position: z.number().int().min(0).max(100),
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Aucune modification.');
export type UpdateBannerInput = z.infer<typeof updateBannerBody>;

const isoDateTime = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

export const updateAdBody = z
  .strictObject({
    advertiser: z.string().trim().min(2).max(80).nullable(),
    startsAt: isoDateTime.nullable(),
    endsAt: isoDateTime.nullable(),
    priority: z.number().int().min(0).max(100),
    image,
    imageMobile: image.nullable(),
    alt: z.string().trim().min(5, 'Décrivez le visuel : ce texte est lu par les lecteurs d’écran.').max(250),
    href: link,
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Aucune modification.');
export type UpdateAdInput = z.infer<typeof updateAdBody>;

export const listAdsQuery = z.strictObject({ placement: z.enum(AD_PLACEMENTS).optional() });

export const slugParam = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Adresse invalide.')
    .max(120),
});
export const legalSlugParam = z.object({ slug: z.enum(LEGAL_SLUGS) });

export const articleBody = z.strictObject({
  slug: slugParam.shape.slug,
  title: z.string().trim().min(5).max(150),
  category: z.string().trim().min(2).max(60),
  excerpt: z.string().trim().min(10).max(300),
  cover: image,
  content: z
    .array(z.strictObject({ type: z.enum(['p', 'h2']), text: z.string().trim().min(1).max(5_000) }))
    .min(1, 'L’article est vide.')
    .max(200),
  publishedAt: isoDateTime,
  readingTime: z.number().int().min(1).max(120),
  status: z.enum(['draft', 'published']),
  seo: z
    .strictObject({ title: z.string().trim().max(70), description: z.string().trim().max(160) })
    .nullable()
    .default(null),
});
export type ArticleInput = z.infer<typeof articleBody>;

export const legalPageBody = z.strictObject({
  title: z.string().trim().min(3).max(120),
  sections: z
    .array(
      z.strictObject({
        heading: z.string().trim().min(2).max(150),
        body: z.array(z.string().trim().min(1).max(5_000)).min(1).max(50),
      }),
    )
    .min(1)
    .max(60),
});
export type LegalPageInput = z.infer<typeof legalPageBody>;
