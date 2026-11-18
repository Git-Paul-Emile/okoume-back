import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import { slugify } from '../../core/text/slugify.js';
import { toCategoryDto } from '../categories/categories.dto.js';
import type { CategoryRecord } from '../categories/categories.repository.js';
import type { StaffCategoriesRepository } from './staff-categories.repository.js';
import type { CreateCategoryInput, UpdateCategoryInput } from './staff-categories.schemas.js';

const SLUG_TAKEN = 'Cette adresse est déjà utilisée par une autre catégorie.';

/** Vrai si « candidate » est la catégorie elle-même ou l'une de ses descendantes : la ranger dessous ferait une boucle. */
export function isSelfOrDescendant(categoryId: string, candidate: string, all: readonly CategoryRecord[]) {
  const children = new Map<string, string[]>();
  for (const c of all) if (c.parentId) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
  const stack = [categoryId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === candidate) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return false;
}

export const createStaffCategoriesService = (categories: StaffCategoriesRepository) => {
  function require(actor: Grantee) {
    if (!can(actor, 'catalogue:modifier')) throw new ForbiddenError();
  }

  /** Parent et membres : catégories existantes, jamais des collections. */
  function assertReferences(all: readonly CategoryRecord[], parentId: string | null | undefined, memberIds?: string[]) {
    const byId = new Map(all.map((c) => [c.id, c] as const));
    if (parentId) {
      const parent = byId.get(parentId);
      if (!parent || parent.isCollection) throw new UnprocessableError('Catégorie parente introuvable.');
    }
    if (memberIds?.some((id) => !byId.get(id) || byId.get(id)!.isCollection))
      throw new UnprocessableError('Une collection regroupe des catégories existantes, pas d’autres collections.');
  }

  return {
    list: async () => (await categories.findAll()).map(toCategoryDto),

    async create(input: CreateCategoryInput, actor: Grantee) {
      require(actor);
      assertReferences(await categories.findAll(), input.parentId, input.memberIds);
      const created = await categories.create({ ...input, slug: input.slug ?? (slugify(input.name) || 'categorie') });
      if (!created) throw new ConflictError(SLUG_TAKEN);
      return toCategoryDto(created);
    },

    async update(id: string, input: UpdateCategoryInput, actor: Grantee) {
      require(actor);
      const all = await categories.findAll();
      const current = all.find((c) => c.id === id);
      if (!current) throw new NotFoundError('Catégorie introuvable.');
      const next = { ...current, ...input };
      if (next.isCollection && next.parentId)
        throw new UnprocessableError('Une collection ne se range pas sous une catégorie.');
      if (!next.isCollection && next.memberIds.length)
        throw new UnprocessableError('Seule une collection regroupe des catégories.');
      if (input.parentId && isSelfOrDescendant(id, input.parentId, all))
        throw new UnprocessableError(
          'Une catégorie ne peut pas être rangée sous elle-même ou sous une de ses sous-catégories.',
        );
      assertReferences(all, input.parentId, input.memberIds);
      const updated = await categories.update(id, input);
      if (!updated) throw new ConflictError(SLUG_TAKEN);
      return toCategoryDto(updated);
    },

    /** Suppression seulement d'une catégorie vide : ni produit, ni sous-catégorie. */
    async remove(id: string, actor: Grantee) {
      require(actor);
      if (!(await categories.findAll()).some((c) => c.id === id)) throw new NotFoundError('Catégorie introuvable.');
      const { products, children } = await categories.usage(id);
      if (products || children)
        throw new ConflictError(
          `Catégorie utilisée (${products} produit${products > 1 ? 's' : ''}, ${children} sous-catégorie${children > 1 ? 's' : ''}) : déplacez-les d’abord.`,
        );
      await categories.delete(id);
    },
  };
};

export type StaffCategoriesService = ReturnType<typeof createStaffCategoriesService>;
