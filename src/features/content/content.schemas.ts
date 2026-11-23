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

export const createAdBody = z.strictObject({
  placement: z.enum(AD_PLACEMENTS),
  advertiser: z.string().trim().min(2).max(80).nullable(),
  priority: z.number().int().min(0).max(100),
  image,
  imageMobile: image.nullable(),
  alt: z.string().trim().min(5, 'Décrivez le visuel : ce texte est lu par les lecteurs d’écran.').max(250),
  href: link,
  active: z.boolean(),
});
export type CreateAdInput = z.infer<typeof createAdBody>;

export const updateAdBody = z
  .strictObject({
    advertiser: z.string().trim().min(2).max(80).nullable(),
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

export const legalSlugParam = z.object({ slug: z.enum(LEGAL_SLUGS) });

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
