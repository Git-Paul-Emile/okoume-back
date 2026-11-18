import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/** Instance unique du client Prisma, importée uniquement par les repositories. */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});
