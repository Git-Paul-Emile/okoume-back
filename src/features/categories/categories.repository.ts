import { prisma } from '../../lib/prisma.js';

export interface CategoryRecord {
  id: string;
  slug: string;
  name: string;
  fullName: string | null;
  parentId: string | null;
  icon: string | null;
  image: string | null;
  imageFit: 'cover' | 'contain';
  position: number;
  isCollection: boolean;
  memberIds: string[];
}

/** Contrat de lecture des catégories. Toute l'arborescence tient en une requête : quelques dizaines de lignes. */
export interface CategoriesRepository {
  findAll(): Promise<CategoryRecord[]>;
}

export const categoriesRepository: CategoriesRepository = {
  async findAll() {
    const rows = await prisma.category.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { members: { select: { categoryId: true } } },
    });
    return rows.map(({ members, createdAt: _c, updatedAt: _u, ...category }) => ({
      ...category,
      memberIds: members.map((m) => m.categoryId),
    }));
  },
};
