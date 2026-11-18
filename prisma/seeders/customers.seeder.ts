import { z } from 'zod';
import { phoneKey } from '../../src/features/auth/auth.service.js';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.email(),
    phone: z.string().nullable(),
    birthday: z.iso.date().nullable(),
    referralCode: z.string().min(1),
    createdAt: isoDate,
  }),
);

/** Contenu validé de data/customers.json */
export const loadCustomers = () => readData('customers.json', schema);

export const customerId = (legacyId: string) => legacyUuid('customer', legacyId);

/**
 * Clients de démonstration, adresse e-mail déjà vérifiée, tous avec le mot de passe de démonstration.
 * Pas encore modélisés côté API : adresses enregistrées, favoris, produits consultés.
 */
export const customersSeeder: Seeder = {
  name: 'customers',
  demo: true,
  async run({ prisma, demoPasswordHash }) {
    const passwordHash = await demoPasswordHash();
    const customers = loadCustomers();
    const { count } = await prisma.customer.createMany({
      data: customers.map((c) => ({
        id: customerId(c.id),
        email: c.email.toLowerCase(),
        phone: c.phone,
        phoneKey: c.phone ? phoneKey(c.phone) : null,
        passwordHash,
        firstName: c.firstName,
        lastName: c.lastName,
        status: 'active' as const,
        emailVerifiedAt: c.createdAt,
        referralCode: c.referralCode,
        birthDate: c.birthday ? new Date(`${c.birthday}T00:00:00.000Z`) : null,
        createdAt: c.createdAt,
      })),
      skipDuplicates: true,
    });
    return count;
  },
};
