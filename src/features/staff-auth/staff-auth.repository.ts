import { prisma } from '../../lib/prisma.js';
import type { StaffRoleName } from '../../core/security/permissions.js';

export interface StaffRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string | null;
  role: StaffRoleName;
  extraRoles: StaffRoleName[];
  status: 'invited' | 'active' | 'suspended';
  sessionsRevokedAt: Date | null;
  /** Plafond de remboursement en FCFA ; null : aucun remboursement autorisé (hors administrateur principal) */
  refundLimit: number | null;
  inviteExpiresAt: Date | null;
  customPermissions: string[];
}

const select = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  passwordHash: true,
  role: true,
  extraRoles: true,
  status: true,
  sessionsRevokedAt: true,
  refundLimit: true,
  inviteExpiresAt: true,
  customRoles: { select: { customRole: { select: { permissions: true } } } },
} as const;

type Row = Omit<StaffRecord, 'customPermissions' | 'refundLimit'> & {
  refundLimit: { toNumber(): number } | null;
  customRoles: Array<{ customRole: { permissions: string[] } }>;
};

const toRecord = (row: Row | null): StaffRecord | null => {
  if (!row) return null;
  const { customRoles, refundLimit, ...rest } = row;
  return {
    ...rest,
    refundLimit: refundLimit?.toNumber() ?? null,
    customPermissions: [...new Set(customRoles.flatMap((r) => r.customRole.permissions))],
  };
};

export const staffRepository: StaffRepository = {
  findByEmail: async (email: string) => toRecord(await prisma.staffMember.findUnique({ where: { email }, select })),

  findById: async (id: string) => toRecord(await prisma.staffMember.findUnique({ where: { id }, select })),

  findByInviteTokenHash: async (inviteTokenHash: string) =>
    toRecord(await prisma.staffMember.findUnique({ where: { inviteTokenHash }, select })),

  touchLogin: (id: string, at: Date) =>
    prisma.staffMember.update({ where: { id }, data: { lastLoginAt: at }, select: { id: true } }),

  /** Fin de l'invitation : mot de passe, codes de secours et activation, ensemble ou pas du tout. */
  acceptInvitation: (id: string, passwordHash: string, backupCodeHashes: string[]) =>
    prisma.$transaction([
      prisma.backupCode.deleteMany({ where: { staffId: id } }),
      prisma.backupCode.createMany({ data: backupCodeHashes.map((codeHash) => ({ staffId: id, codeHash })) }),
      prisma.staffMember.update({
        where: { id },
        data: { passwordHash, status: 'active', inviteTokenHash: null, inviteExpiresAt: null },
        select: { id: true },
      }),
    ]),

  /** Utilise un code de secours une seule fois, même en cas de requêtes simultanées. */
  async useBackupCode(staffId: string, codeHash: string, at: Date) {
    const result = await prisma.backupCode.updateMany({
      where: { staffId, codeHash, usedAt: null },
      data: { usedAt: at },
    });
    return result.count === 1;
  },

  replaceBackupCodes: (staffId: string, codeHashes: string[]) =>
    prisma.$transaction([
      prisma.backupCode.deleteMany({ where: { staffId } }),
      prisma.backupCode.createMany({ data: codeHashes.map((codeHash) => ({ staffId, codeHash })) }),
    ]),

  countUnusedBackupCodes: (staffId: string) => prisma.backupCode.count({ where: { staffId, usedAt: null } }),

  updatePassword: (staffId: string, passwordHash: string) =>
    prisma.staffMember.update({ where: { id: staffId }, data: { passwordHash }, select: { id: true } }),
};

/** Contrat de stockage des membres de l'équipe et de leurs codes de secours. */
export interface StaffRepository {
  findByEmail(email: string): Promise<StaffRecord | null>;
  findById(id: string): Promise<StaffRecord | null>;
  findByInviteTokenHash(inviteTokenHash: string): Promise<StaffRecord | null>;
  touchLogin(id: string, at: Date): Promise<unknown>;
  acceptInvitation(id: string, passwordHash: string, backupCodeHashes: string[]): Promise<unknown>;
  useBackupCode(staffId: string, codeHash: string, at: Date): Promise<boolean>;
  replaceBackupCodes(staffId: string, codeHashes: string[]): Promise<unknown>;
  countUnusedBackupCodes(staffId: string): Promise<number>;
  updatePassword(staffId: string, passwordHash: string): Promise<unknown>;
}
