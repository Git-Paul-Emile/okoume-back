import { z } from 'zod';
import { isPermission } from '../../core/security/permissions.js';
import { email } from '../auth/auth.schemas.js';

const role = z.enum(['super_admin', 'catalog_manager', 'orders_manager', 'stock_manager']);
const extraRoles = z.array(role).max(4);
const customRoleIds = z.array(z.uuid()).max(20);
/** Plafond de remboursement délégué (14.5), en FCFA ; null : pas de délégation */
const refundLimit = z.int().min(0).max(100_000_000).nullable();

export const inviteMemberBody = z.strictObject({
  email,
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  role,
  extraRoles: extraRoles.default([]),
  customRoleIds: customRoleIds.default([]),
  refundLimit: refundLimit.default(null),
});
export type InviteMemberInput = z.infer<typeof inviteMemberBody>;

export const updateMemberBody = z
  .strictObject({
    role,
    extraRoles,
    customRoleIds,
    status: z.enum(['active', 'suspended']),
    refundLimit,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Aucune modification.');
export type UpdateMemberInput = z.infer<typeof updateMemberBody>;

export const backupCodeResetBody = z.strictObject({
  reason: z.string().trim().min(5, 'Indiquez comment l’identité du membre a été vérifiée.').max(300),
});

export const customRoleBody = z.strictObject({
  name: z.string().trim().min(2).max(60),
  permissions: z
    .array(z.string().refine(isPermission, 'Droit inconnu.'))
    .min(1, 'Choisissez au moins un droit.')
    .max(100),
});
export type CustomRoleInput = z.infer<typeof customRoleBody>;
