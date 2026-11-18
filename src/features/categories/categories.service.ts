import { toCategoryDto } from './categories.dto.js';
import type { CategoriesRepository, CategoryRecord } from './categories.repository.js';

/** Catégorie racine d'une catégorie (remonte les parents ; s'arrête sur une boucle éventuelle). */
export function rootOf(categoryId: string, byId: ReadonlyMap<string, CategoryRecord>) {
  let current = byId.get(categoryId);
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current?.id ?? categoryId;
}

/** La catégorie et toutes ses parentes, de la plus précise à la racine (s'arrête sur une boucle éventuelle). */
export function ancestry(categoryId: string, byId: ReadonlyMap<string, CategoryRecord>) {
  const chain: string[] = [];
  let current = byId.get(categoryId);
  while (current && !chain.includes(current.id)) {
    chain.push(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain.length ? chain : [categoryId];
}

export const createCategoriesService = (repository: CategoriesRepository) => ({
  async list() {
    return (await repository.findAll()).map(toCategoryDto);
  },

  /** Index par identifiant, pour calculer la catégorie racine des produits. */
  async index() {
    return new Map((await repository.findAll()).map((c) => [c.id, c] as const));
  },
});

export type CategoriesService = ReturnType<typeof createCategoriesService>;
