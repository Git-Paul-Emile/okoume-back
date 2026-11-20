import { z } from 'zod';
import { randomBackupCode } from '../../src/core/security/secrets.js';
import { BACKUP_CODE_COUNT, hashBackupCode } from '../../src/features/staff-auth/backup-codes.js';
import { legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.email(),
    role: z.enum(['super_admin', 'catalog_manager', 'orders_manager', 'stock_manager']),
    status: z.enum(['invited', 'active', 'suspended']).optional(),
  }),
);

/** Contenu validé de data/staff.json */
export const loadStaff = () => readData('staff.json', schema);

export const staffId = (legacyId: string) => legacyUuid('staff', legacyId);

/** Propriétaire de la boutique (super_admin), auteur des encaissements de démonstration. */
export function ownerStaffId() {
  const owner = loadStaff().find((m) => m.role === 'super_admin' && m.status !== 'invited');
  if (!owner) throw new Error('data/staff.json : aucun super_admin actif');
  return staffId(owner.id);
}

/**
 * Comptes de l'équipe de démonstration. Les comptes actifs reçoivent le mot de passe de démonstration ; un
 * compte invité n'en a pas et attend une nouvelle invitation depuis l'administration.
 */
export const staffSeeder: Seeder = {
  name: 'staff',
  demo: true,
  async run({ prisma, demoPasswordHash, reportDemoBackupCodes }) {
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
          role: m.role,
          status,
          passwordHash: status === 'invited' ? null : passwordHash,
        };
      }),
      skipDuplicates: true,
    });

    // Les codes sont des secrets irrécupérables : ne les crée que si le terminal peut les remettre une seule fois.
    if (!reportDemoBackupCodes) return count;

    for (const member of members.filter((m) => (m.status ?? 'active') === 'active')) {
      const id = staffId(member.id);
      const existingCodes = await prisma.backupCode.count({ where: { staffId: id } });
      if (existingCodes > 0) continue;

      const codes = Array.from({ length: BACKUP_CODE_COUNT }, randomBackupCode);
      await prisma.backupCode.createMany({
        data: codes.map((code) => ({ staffId: id, codeHash: hashBackupCode(code) })),
      });
      reportDemoBackupCodes(member.email.toLowerCase(), codes);
    }

    return count;
  },
};
