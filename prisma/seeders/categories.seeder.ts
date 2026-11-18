import { z } from 'zod';
import { legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    slug: z.string().min(1),
    name: z.string().min(1),
    fullName: z.string().optional(),
    parentId: z.string().nullable(),
    icon: z.string().optional(),
    image: z.string().nullable().optional(),
    imageFit: z.enum(['cover', 'contain']).optional(),
    members: z.array(z.string()).optional(),
  }),
);

/** Contenu validé de data/categories.json */
export const loadCategories = () => readData('categories.json', schema);

export const categoryId = (legacyId: string) => legacyUuid('category', legacyId);

/**
 * Arborescence du catalogue et collections. Les parents sont insérés avant leurs enfants : chaque niveau
 * référence des lignes déjà présentes.
 */
export const categoriesSeeder: Seeder = {
  name: 'categories',
  demo: true,
  async run({ prisma }) {
    const categories = loadCategories();
    const known = new Set(categories.map((c) => c.id));
    for (const c of categories)
      for (const ref of [c.parentId, ...(c.members ?? [])])
        if (ref && !known.has(ref)) throw new Error(`data/categories.json : « ${c.id} » cite « ${ref} », inconnue`);

    const depth = (id: string | null, seen = 0): number => {
      if (!id || seen > categories.length) return 0;
      return 1 + depth(categories.find((c) => c.id === id)?.parentId ?? null, seen + 1);
    };
    const ranked = categories.map((category, position) => ({ category, position, depth: depth(category.parentId) }));
    let count = 0;
    for (const level of [...new Set(ranked.map((r) => r.depth))].sort((a, b) => a - b)) {
      const created = await prisma.category.createMany({
        data: ranked
          .filter((r) => r.depth === level)
          .map(({ category, position }) => ({
            id: categoryId(category.id),
            slug: category.slug,
            name: category.name,
            fullName: category.fullName ?? null,
            parentId: category.parentId ? categoryId(category.parentId) : null,
            icon: category.icon ?? null,
            image: category.image ?? null,
            imageFit: category.imageFit ?? 'contain',
            position,
            isCollection: !!category.members?.length,
          })),
        skipDuplicates: true,
      });
      count += created.count;
    }
    await prisma.collectionMember.createMany({
      data: categories.flatMap((c) =>
        (c.members ?? []).map((member) => ({ collectionId: categoryId(c.id), categoryId: categoryId(member) })),
      ),
      skipDuplicates: true,
    });
    return count;
  },
};
