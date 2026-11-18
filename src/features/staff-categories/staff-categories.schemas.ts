import { z } from 'zod';

const slug = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Adresse en minuscules, chiffres et tirets.');
const imageUrl = z.url({ protocol: /^https$/, message: 'Adresse d’image HTTPS attendue.' }).max(500);

const fields = {
  slug,
  name: z.string().trim().min(2).max(60),
  fullName: z.string().trim().min(2).max(120).nullable(),
  parentId: z.uuid().nullable(),
  icon: z.string().trim().min(1).max(40).nullable(),
  image: imageUrl.nullable(),
  imageFit: z.enum(['cover', 'contain']),
  position: z.int().min(0).max(10_000),
  /** Collection transversale : regroupe des catégories, sans parent dans l'arborescence */
  isCollection: z.boolean(),
  memberIds: z.array(z.uuid()).max(100),
};

export const createCategoryBody = z
  .strictObject({
    ...fields,
    slug: slug.optional(),
    fullName: fields.fullName.default(null),
    parentId: fields.parentId.default(null),
    icon: fields.icon.default(null),
    image: fields.image.default(null),
    imageFit: fields.imageFit.default('contain'),
    position: fields.position.default(0),
    isCollection: fields.isCollection.default(false),
    memberIds: fields.memberIds.default([]),
  })
  .refine((c) => !c.isCollection || c.parentId === null, {
    message: 'Une collection ne se range pas sous une catégorie.',
    path: ['parentId'],
  })
  .refine((c) => c.isCollection || c.memberIds.length === 0, {
    message: 'Seule une collection regroupe des catégories.',
    path: ['memberIds'],
  });

export type CreateCategoryInput = z.infer<typeof createCategoryBody>;

export const updateCategoryBody = z
  .strictObject(fields)
  .partial()
  .refine((c) => Object.keys(c).length > 0, { message: 'Aucune modification envoyée.' });

export type UpdateCategoryInput = z.infer<typeof updateCategoryBody>;
