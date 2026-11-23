import { PrismaPg } from '@prisma/adapter-pg';
import { pino } from 'pino';
import { hashPassword } from '../../src/core/security/passwords.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedConfig } from './config.js';
import { accessPlansSeeder } from './access-plans.seeder.js';
import { categoriesSeeder } from './categories.seeder.js';
import { contentSeeder } from './content.seeder.js';
import { couriersSeeder } from './couriers.seeder.js';
import { customersSeeder } from './customers.seeder.js';
import { deliveryZonesSeeder } from './delivery-zones.seeder.js';
import { loyaltyMovementsSeeder } from './loyalty-movements.seeder.js';
import { ordersSeeder } from './orders.seeder.js';
import { productsSeeder } from './products.seeder.js';
import { promoCodesSeeder } from './promo-codes.seeder.js';
import { settingsSeeder } from './settings.seeder.js';
import { staffSeeder } from './staff.seeder.js';
import { zoneRequestsSeeder } from './zone-requests.seeder.js';
import { reviewsSeeder } from './reviews.seeder.js';
import { assistantSeeder } from './assistant.seeder.js';
import { shopsSeeder } from './shops.seeder.js';
import { sellerOrdersSeeder } from './seller-orders.seeder.js';
import { marketplaceSeeder } from './marketplace.seeder.js';
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
  zoneRequestsSeeder,
  accessPlansSeeder,
  staffSeeder,
  customersSeeder,
  shopsSeeder,
  categoriesSeeder,
  marketplaceSeeder,
  productsSeeder,
  promoCodesSeeder,
  contentSeeder,
  couriersSeeder,
  ordersSeeder,
  sellerOrdersSeeder,
  loyaltyMovementsSeeder,
  reviewsSeeder,
  assistantSeeder,
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
  if (seedConfig.SEED_DEMO_BACKUP_CODES && process.env['RENDER'] === 'true')
    throw new Error('SEED_DEMO_BACKUP_CODES must only be used from a trusted local terminal, never on Render');
  if (production && seedConfig.SEED_DEMO_BACKUP_CODES && !seedDemoInProduction)
    throw new Error('ALLOW_PRODUCTION_DEMO_SEED=true is required to seed demo backup codes in production');
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

  const reportDemoBackupCodes = seedConfig.SEED_DEMO_BACKUP_CODES
    ? (email: string, codes: string[]) => {
        process.stdout.write(
          `\nCodes de secours de démonstration pour ${email} (affichés une seule fois) :\n${codes.join('\n')}\n\n`,
        );
      }
    : undefined;

  // Connexion directe quand elle existe : elle convient mieux que le pooler de Neon aux gros envois du seed
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: seedConfig.DIRECT_DATABASE_URL ?? seedConfig.DATABASE_URL }),
  });
  try {
    for (const seeder of seeders) {
      const created = await seeder.run({ prisma, demoPasswordHash, reportDemoBackupCodes });
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
