import { z } from 'zod';

/** Événement envoyé par le site ; le consentement à la mesure d'audience est vérifié avant tout envoi (18.2). */
export const eventBody = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('visit'), pwa: z.boolean().default(false) }),
  z.strictObject({ kind: z.enum(['product_view', 'product_click', 'add_to_cart']), productId: z.uuid() }),
  z.strictObject({
    kind: z.literal('search'),
    term: z.string().trim().toLowerCase().min(2).max(80),
    results: z.int().min(0).max(100_000),
  }),
  z.strictObject({ kind: z.literal('checkout') }),
]);
export type EventInput = z.infer<typeof eventBody>;

const MAX_DAYS = 400;

/** Période lue par l'équipe : au plus 400 jours (la conservation est de 13 mois). */
export const windowQuery = z
  .strictObject({
    from: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
    to: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
  })
  .refine((w) => w.to > w.from, { message: 'La fin doit être après le début.', path: ['to'] })
  .refine((w) => w.to.getTime() - w.from.getTime() <= MAX_DAYS * 86_400_000, {
    message: `${MAX_DAYS} jours au plus.`,
    path: ['from'],
  });
export type WindowQuery = z.infer<typeof windowQuery>;
