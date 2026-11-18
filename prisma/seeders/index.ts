import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../../src/config/env.js';
import { hashPassword } from '../../src/core/security/passwords.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { logger } from '../../src/lib/logger.js';
import { accessPlansSeeder } from './access-plans.seeder.js';
import { categoriesSeeder } from './categories.seeder.js';
import { contentSeeder } from './content.seeder.js';
import { couriersSeeder } from './couriers.seeder.js';
import { customRolesSeeder } from './custom-roles.seeder.js';
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
import { ticketsSeeder } from './tickets.seeder.js';
import { privacySeeder } from './privacy.seeder.js';
import { assistantSeeder } from './assistant.seeder.js';
import type { Seeder } from './support.js';

/** Ordre imposé par les relations : chaque donnée vient après celles qu'elle référence. */
const SEEDERS: Seeder[] = [
  settingsSeeder,
  deliveryZonesSeeder,
  zoneRequestsSeeder,
  customRolesSeeder,
  accessPlansSeeder,
  staffSeeder,
  customersSeeder,
  categoriesSeeder,
  productsSeeder,
  promoCodesSeeder,
  contentSeeder,
  couriersSeeder,
  ordersSeeder,
  loyaltyMovementsSeeder,
  reviewsSeeder,
  ticketsSeeder,
  privacySeeder,
  assistantSeeder,
];

/**
 * Remplit la base à partir de prisma/seeders/data (npm run db:seed). Rejouable : seules les lignes absentes
 * sont créées. En production, seules les données de référence sont chargées : jamais de comptes ni de
 * commandes de démonstration.
 */
async function main() {
  const production = env.NODE_ENV === 'production';
  const seeders = SEEDERS.filter((s) => !production || !s.demo);
  if (production) logger.warn('Production : données de démonstration ignorées, données de référence seules');

  let hash: Promise<string> | null = null;
  const demoPasswordHash = () => {
    if (!env.SEED_DEMO_PASSWORD)
      throw new Error(
        'SEED_DEMO_PASSWORD manquant : mot de passe des comptes de démonstration (12 caractères au moins)',
      );
    hash ??= hashPassword(env.SEED_DEMO_PASSWORD);
    return hash;
  };

  // Connexion directe quand elle existe : elle convient mieux que le pooler de Neon aux gros envois du seed
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DIRECT_DATABASE_URL ?? env.DATABASE_URL }),
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
