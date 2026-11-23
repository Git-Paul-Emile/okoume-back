import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export interface TeamMemberRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'invited' | 'active' | 'suspended';
  refundLimit: number | null;
  inviteExpiresAt: Date | null;
  lastLoginAt: Date | null;
  backupCodesLeft: number;
  createdAt: Date;
}

export interface NewMember {
  email: string;
  firstName: string;
  lastName: string;
  refundLimit: number | null;
  inviteTokenHash: string;
  inviteExpiresAt: Date;
}

export interface MemberChanges {
  status?: 'active' | 'suspended';
  refundLimit?: number | null;
  sessionsRevokedAt?: Date;
}

/** Contrat de stockage de l'équipe d'administrateurs. */
export interface StaffTeamRepository {
  list(): Promise<TeamMemberRecord[]>;
  find(id: string): Promise<TeamMemberRecord | null>;
  /** null : adresse déjà utilisée par un autre membre. */
  invite(member: NewMember): Promise<TeamMemberRecord | null>;
  renewInvite(id: string, inviteTokenHash: string, inviteExpiresAt: Date): Promise<TeamMemberRecord | null>;
  update(id: string, changes: MemberChanges): Promise<TeamMemberRecord | null>;
  /** Retire les codes de secours et ferme les sessions : le membre en reçoit de nouveaux à sa prochaine connexion. */
  resetBackupCodes(id: string, at: Date): Promise<boolean>;
  countActiveStaff(): Promise<number>;
}

const select = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  refundLimit: true,
  inviteExpiresAt: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { backupCodes: { where: { usedAt: null } } } },
} satisfies Prisma.StaffMemberSelect;

const toRecord = (m: Prisma.StaffMemberGetPayload<{ select: typeof select }>): TeamMemberRecord => ({
  id: m.id,
  email: m.email,
  firstName: m.firstName,
  lastName: m.lastName,
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

  async invite(member) {
    try {
      return toRecord(
        await prisma.staffMember.create({
          data: {
            ...member,
            role: 'super_admin',
            status: 'invited',
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

  update: async (id, changes) => {
    try {
      return toRecord(await prisma.staffMember.update({ where: { id }, data: changes, select }));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  },

  async resetBackupCodes(id, at) {
    const [, updated] = await prisma.$transaction([
      prisma.backupCode.deleteMany({ where: { staffId: id } }),
      prisma.staffMember.updateMany({ where: { id }, data: { sessionsRevokedAt: at } }),
    ]);
    return updated.count === 1;
  },

  countActiveStaff: () => prisma.staffMember.count({ where: { status: 'active' } }),

};
