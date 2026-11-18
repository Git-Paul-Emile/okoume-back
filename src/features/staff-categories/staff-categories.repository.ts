import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { categoriesRepository, type CategoryRecord } from '../categories/categories.repository.js';

export type CategoryFields = Omit<CategoryRecord, 'id'>;

/** Contrat d'écriture des catégories côté équipe. */
export interface StaffCategoriesRepository {
  findAll(): Promise<CategoryRecord[]>;
  /** null : l'adresse est déjà prise. */
  create(fields: CategoryFields): Promise<CategoryRecord | null>;
  update(id: string, fields: Partial<CategoryFields>): Promise<CategoryRecord | null>;
  usage(id: string): Promise<{ products: number; children: number }>;
  delete(id: string): Promise<void>;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const findOne = async (id: string) => (await categoriesRepository.findAll()).find((c) => c.id === id) ?? null;

export const staffCategoriesRepository: StaffCategoriesRepository = {
  findAll: () => categoriesRepository.findAll(),

  async create({ memberIds, ...fields }) {
    try {
      const created = await prisma.category.create({
        data: { ...fields, members: { create: memberIds.map((categoryId) => ({ categoryId })) } },
        select: { id: true },
      });
      return findOne(created.id);
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  /** Les membres d'une collection sont remplacés en entier quand ils sont envoyés. */
  async update(id, { memberIds, ...fields }) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.category.update({ where: { id }, data: fields, select: { id: true } });
        if (memberIds) {
          await tx.collectionMember.deleteMany({ where: { collectionId: id } });
          await tx.collectionMember.createMany({
            data: memberIds.map((categoryId) => ({ collectionId: id, categoryId })),
          });
        }
      });
      return findOne(id);
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  async usage(id) {
    const [products, children] = await prisma.$transaction([
      prisma.product.count({ where: { categoryId: id } }),
      prisma.category.count({ where: { parentId: id } }),
    ]);
    return { products, children };
  },

  async delete(id) {
    await prisma.category.delete({ where: { id }, select: { id: true } });
  },
};
