import { prisma } from '../../lib/prisma.js';

/** Vérifie que la base répond, par la requête la plus légère possible. */
export const healthRepository = {
  async pingDatabase(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  },
};

export type HealthRepository = typeof healthRepository;
