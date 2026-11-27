import { z } from 'zod';
import { legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.email(),
    status: z.enum(['invited', 'active', 'suspended']).optional(),
  }),
);

/** Contenu validé de data/staff.json */
export const loadStaff = () => readData('staff.json', schema);

export const staffId = (legacyId: string) => legacyUuid('staff', legacyId);

/** Administrateur de démonstration, auteur des encaissements. */
export function ownerStaffId() {
  const owner = loadStaff().find((m) => m.status !== 'invited');
  if (!owner) throw new Error('data/staff.json : aucun administrateur actif');
  return staffId(owner.id);
}

/**
 * Comptes de l'équipe de démonstration. Les comptes actifs reçoivent le mot de passe de démonstration ; un
 * compte invité n'en a pas et attend une nouvelle invitation depuis l'administration.
 */
export const staffSeeder: Seeder = {
  name: 'staff',
  demo: true,
  async run({ prisma, demoPasswordHash }) {
    const passwordHash = await demoPasswordHash();
    const members = loadStaff();
    const { count } = await prisma.staffMember.createMany({
      data: members.map((m) => {
        const status = m.status ?? 'active';
        return {
          id: staffId(m.id),
          email: m.email.toLowerCase(),
          firstName: m.firstName,
          lastName: m.lastName,
          role: 'super_admin',
          status,
          passwordHash: status === 'invited' ? null : passwordHash,
        };
      }),
      skipDuplicates: true,
    });

    return count;
  },
};
