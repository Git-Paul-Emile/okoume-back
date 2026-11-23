import { permissionsOf, rolesOf, type Grantee } from '../../core/security/permissions.js';
import type { StaffRecord } from './staff-auth.repository.js';

/** Membre de l'équipe connecté, avec ses droits effectifs (calculés par l'API, jamais par le front). */
export interface StaffMeDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: StaffRecord['role'];
  roles: StaffRecord['role'][];
  permissions: string[];
  owner: boolean;
}

export const toGrantee = (_staff: StaffRecord): Grantee => ({
  role: 'super_admin',
  extraRoles: [],
  customPermissions: [],
});

export const toStaffMeDto = (staff: StaffRecord): StaffMeDto => {
  const grantee = toGrantee(staff);
  const roles = rolesOf(grantee);
  return {
    id: staff.id,
    email: staff.email,
    firstName: staff.firstName,
    lastName: staff.lastName,
    role: 'super_admin',
    roles,
    permissions: [...permissionsOf(grantee)].sort(),
    owner: roles.includes('super_admin'),
  };
};
