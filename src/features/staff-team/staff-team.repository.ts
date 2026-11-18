import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import type { StaffRoleName } from '../../core/security/permissions.js';

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export interface TeamMemberRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: StaffRoleName;
  extraRoles: StaffRoleName[];
  customRoleIds: string[];
  status: 'invited' | 'active' | 'suspended';
  refundLimit: number | null;
  inviteExpiresAt: Date | null;
  lastLoginAt: Date | null;
  backupCodesLeft: number;
  createdAt: Date;
}

export interface CustomRoleRecord {
  id: string;
  name: string;
  permissions: string[];
}

export interface NewMember {
  email: string;
  firstName: string;
  lastName: string;
  role: StaffRoleName;
  extraRoles: StaffRoleName[];
  customRoleIds: string[];
  refundLimit: number | null;
  inviteTokenHash: string;
  inviteExpiresAt: Date;
}

export interface MemberChanges {
  role?: StaffRoleName;
  extraRoles?: StaffRoleName[];
  customRoleIds?: string[];
  status?: 'active' | 'suspended';
  refundLimit?: number | null;
  sessionsRevokedAt?: Date;
}

/** Contrat de stockage de l'équipe et des rôles personnalisés. */
export interface StaffTeamRepository {
  list(): Promise<TeamMemberRecord[]>;
  find(id: string): Promise<TeamMemberRecord | null>;
  /** null : adresse déjà utilisée par un autre membre. */
  invite(member: NewMember): Promise<TeamMemberRecord | null>;
  renewInvite(id: string, inviteTokenHash: string, inviteExpiresAt: Date): Promise<TeamMemberRecord | null>;
  update(id: string, changes: MemberChanges): Promise<TeamMemberRecord | null>;
  /** Retire les codes de secours et ferme les sessions : le membre en reçoit de nouveaux à sa prochaine connexion. */
  resetBackupCodes(id: string, at: Date): Promise<boolean>;
  countActiveOwners(): Promise<number>;
  customRoles(): Promise<CustomRoleRecord[]>;
  customRolesExist(ids: string[]): Promise<boolean>;
  /** null : nom déjà pris. Les membres qui ont ce rôle sont déconnectés pour recevoir les nouveaux droits. */
  saveCustomRole(
    role: { id?: string; name: string; permissions: string[] },
    at: Date,
  ): Promise<CustomRoleRecord | null>;
}

const select = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  extraRoles: true,
  status: true,
  refundLimit: true,
  inviteExpiresAt: true,
  lastLoginAt: true,
  createdAt: true,
  customRoles: { select: { customRoleId: true } },
  _count: { select: { backupCodes: { where: { usedAt: null } } } },
} satisfies Prisma.StaffMemberSelect;

const toRecord = (m: Prisma.StaffMemberGetPayload<{ select: typeof select }>): TeamMemberRecord => ({
  id: m.id,
  email: m.email,
  firstName: m.firstName,
  lastName: m.lastName,
  role: m.role,
  extraRoles: m.extraRoles,
  customRoleIds: m.customRoles.map((r) => r.customRoleId),
  status: m.status,
  refundLimit: m.refundLimit?.toNumber() ?? null,
  inviteExpiresAt: m.inviteExpiresAt,
  lastLoginAt: m.lastLoginAt,
  backupCodesLeft: m._count.backupCodes,
  createdAt: m.createdAt,
});

const isNotFound = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

export const staffTeamRepository: StaffTeamRepository = {
  list: async () =>
    (await prisma.staffMember.findMany({ select, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map(toRecord),

  find: async (id) => {
    const m = await prisma.staffMember.findUnique({ where: { id }, select });
    return m ? toRecord(m) : null;
  },

  async invite({ customRoleIds, ...member }) {
    try {
      return toRecord(
        await prisma.staffMember.create({
          data: {
            ...member,
            status: 'invited',
            customRoles: { create: customRoleIds.map((customRoleId) => ({ customRoleId })) },
          },
          select,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  async renewInvite(id, inviteTokenHash, inviteExpiresAt) {
    const result = await prisma.staffMember.updateMany({
      where: { id, status: 'invited' },
      data: { inviteTokenHash, inviteExpiresAt },
    });
    return result.count ? staffTeamRepository.find(id) : null;
  },

  update: (id, { customRoleIds, ...changes }) =>
    prisma.$transaction(async (tx) => {
      try {
        if (customRoleIds) {
          await tx.staffCustomRole.deleteMany({ where: { staffId: id } });
          await tx.staffCustomRole.createMany({
            data: customRoleIds.map((customRoleId) => ({ staffId: id, customRoleId })),
          });
        }
        return toRecord(await tx.staffMember.update({ where: { id }, data: changes, select }));
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    }),

  async resetBackupCodes(id, at) {
    const [, updated] = await prisma.$transaction([
      prisma.backupCode.deleteMany({ where: { staffId: id } }),
      prisma.staffMember.updateMany({ where: { id }, data: { sessionsRevokedAt: at } }),
    ]);
    return updated.count === 1;
  },

  countActiveOwners: () => prisma.staffMember.count({ where: { role: 'super_admin', status: 'active' } }),

  customRoles: () =>
    prisma.customRole.findMany({ select: { id: true, name: true, permissions: true }, orderBy: { name: 'asc' } }),

  customRolesExist: async (ids) =>
    (await prisma.customRole.count({ where: { id: { in: ids } } })) === new Set(ids).size,

  saveCustomRole: (role, at) =>
    prisma.$transaction(async (tx) => {
      try {
        const data = { name: role.name, permissions: role.permissions };
        const saved = role.id
          ? await tx.customRole.update({
              where: { id: role.id },
              data,
              select: { id: true, name: true, permissions: true },
            })
          : await tx.customRole.create({ data, select: { id: true, name: true, permissions: true } });
        await tx.staffMember.updateMany({
          where: { customRoles: { some: { customRoleId: saved.id } } },
          data: { sessionsRevokedAt: at },
        });
        return saved;
      } catch (error) {
        if (isUniqueViolation(error)) return null;
        throw error;
      }
    }),
};
