import type { CategoryRecord } from './categories.repository.js';

/** Même forme que le type Category du front (front/src/features/categories/categories.types.ts). */
export interface CategoryDto {
  id: string;
  slug: string;
  name: string;
  fullName?: string;
  parentId: string | null;
  icon?: string;
  image: string | null;
  imageFit: 'cover' | 'contain';
  members?: string[];
}

export const toCategoryDto = (c: CategoryRecord): CategoryDto => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  ...(c.fullName ? { fullName: c.fullName } : {}),
  parentId: c.parentId,
  ...(c.icon ? { icon: c.icon } : {}),
  image: c.image,
  imageFit: c.imageFit,
  ...(c.isCollection ? { members: c.memberIds } : {}),
});
