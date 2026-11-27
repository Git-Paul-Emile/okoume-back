import { PrismaPg } from '@prisma/adapter-pg';
import { pino } from 'pino';
import { hashPassword } from '../../src/core/security/passwords.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedConfig } from './config.js';
import { categoriesSeeder } from './categories.seeder.js';
import { contentSeeder } from './content.seeder.js';
import { couriersSeeder } from './couriers.seeder.js';
import { customersSeeder } from './customers.seeder.js';
import { deliveryZonesSeeder } from './delivery-zones.seeder.js';
import { ordersSeeder } from './orders.seeder.js';
import { productsSeeder } from './products.seeder.js';
import { promoCodesSeeder } from './promo-codes.seeder.js';
import { settingsSeeder } from './settings.seeder.js';
import { staffSeeder } from './staff.seeder.js';
import { reviewsSeeder } from './reviews.seeder.js';
import { shopsSeeder } from './shops.seeder.js';
import { sellerOrdersSeeder } from './seller-orders.seeder.js';
import type { Seeder } from './support.js';

const logger = pino({
  level: seedConfig.LOG_LEVEL,
  base: { service: 'okoza-api-seed', env: seedConfig.NODE_ENV },
  redact: { paths: ['*.password', '*.token', '*.refreshToken', '*.code'], censor: '[masqué]' },
});

/** Ordre imposé par les relations : chaque donnée vient après celles qu'elle référence. */
const SEEDERS: Seeder[] = [
  settingsSeeder,
  deliveryZonesSeeder,
  staffSeeder,
  customersSeeder,
  shopsSeeder,
  categoriesSeeder,
  productsSeeder,
  promoCodesSeeder,
  contentSeeder,
  couriersSeeder,
  ordersSeeder,
  sellerOrdersSeeder,
  reviewsSeeder,
];

/**
 * Remplit la base à partir de prisma/seeders/data (npm run db:seed). Rejouable : seules les lignes absentes
 * sont créées. En production, les démonstrations sont exclues par défaut et exigent ALLOW_PRODUCTION_DEMO_SEED.
 */
async function main() {
  const production = seedConfig.NODE_ENV === 'production';
  const seedDemoInProduction = production && seedConfig.ALLOW_PRODUCTION_DEMO_SEED;
  if (seedDemoInProduction && !seedConfig.SEED_DEMO_PASSWORD)
    throw new Error('SEED_DEMO_PASSWORD is mandatory when ALLOW_PRODUCTION_DEMO_SEED=true');
  const seeders = SEEDERS.filter((s) => !production || seedDemoInProduction || !s.demo);
  if (production && !seedDemoInProduction)
    logger.warn('Production : données de démonstration ignorées, données de référence seules');
  if (seedDemoInProduction) logger.warn('Production: explicit demo data seeding enabled');

  let hash: Promise<string> | null = null;
  const demoPasswordHash = () => {
    if (!seedConfig.SEED_DEMO_PASSWORD)
      throw new Error(
        'SEED_DEMO_PASSWORD manquant : mot de passe des comptes de démonstration (12 caractères au moins)',
      );
    hash ??= hashPassword(seedConfig.SEED_DEMO_PASSWORD!);
    return hash;
  };

  // Connexion directe quand elle existe : elle convient mieux que le pooler de Neon aux gros envois du seed
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: seedConfig.DIRECT_DATABASE_URL ?? seedConfig.DATABASE_URL }),
  });
  try {
    for (const seeder of seeders) {
      const created = await seeder.run({ prisma, demoPasswordHash });
      logger.info({ seeder: seeder.name, created }, 'Seed appliqué');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Seed interrompu');
  process.exit(1);
});
