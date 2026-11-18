import { z } from 'zod';
import { isPermission } from '../../src/core/security/permissions.js';
import { legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    name: z.string().min(1),
    permissions: z.array(z.string().refine(isPermission, 'Droit inconnu')),
  }),
);

/** Contenu validé de data/custom-roles.json */
export const loadCustomRoles = () => readData('custom-roles.json', schema);

export const customRoleId = (legacyId: string) => legacyUuid('custom-role', legacyId);

/** Rôles personnalisés de l'équipe (exemple : Comptable), avec des droits « domaine:action » vérifiés. */
export const customRolesSeeder: Seeder = {
  name: 'custom-roles',
  demo: false,
  async run({ prisma }) {
    const roles = loadCustomRoles();
    const { count } = await prisma.customRole.createMany({
      data: roles.map((role) => ({ id: customRoleId(role.id), name: role.name, permissions: role.permissions })),
      skipDuplicates: true,
    });
    return count;
  },
};
