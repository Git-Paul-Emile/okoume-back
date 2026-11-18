import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Configuration de l'outil Prisma (migrations, seed). L'application lit ses variables via src/config/env.ts.
// Les migrations passent par la connexion directe : le pooler de Neon (PgBouncer) ne les supporte pas.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seeders/index.ts',
  },
  // Facultative : la génération du client (prisma generate, au build) n'a pas besoin de base ; migrations et seed
  // échouent clairement si l'adresse manque.
  datasource: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? '' },
});
