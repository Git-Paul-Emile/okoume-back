import { prisma } from '../../lib/prisma.js';

export interface StaffRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string | null;
  role: 'super_admin';
  status: 'invited' | 'active' | 'suspended';
  sessionsRevokedAt: Date | null;
  inviteExpiresAt: Date | null;
}

const select = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  passwordHash: true,
  status: true,
  sessionsRevokedAt: true,
  inviteExpiresAt: true,
} as const;
type Row = Omit<StaffRecord, 'role'>;

const toRecord = (row: Row | null): StaffRecord | null => {
  if (!row) return null;
  return {
    ...row,
    role: 'super_admin',
  };
};

export const staffRepository: StaffRepository = {
  findByEmail: async (email: string) => toRecord(await prisma.staffMember.findUnique({ where: { email }, select })),

  findById: async (id: string) => toRecord(await prisma.staffMember.findUnique({ where: { id }, select })),

  findByInviteTokenHash: async (inviteTokenHash: string) =>
    toRecord(await prisma.staffMember.findUnique({ where: { inviteTokenHash }, select })),

  touchLogin: (id: string, at: Date) =>
    prisma.staffMember.update({ where: { id }, data: { lastLoginAt: at }, select: { id: true } }),

  /** Active un compte invité et retire son lien d'invitation après le choix du mot de passe. */
  acceptInvitation: (id: string, passwordHash: string) =>
    prisma.staffMember.update({
      where: { id },
      data: { passwordHash, status: 'active', inviteTokenHash: null, inviteExpiresAt: null },
      select: { id: true },
    }),

};

/** Contrat de stockage des membres de l'équipe. */
export interface StaffRepository {
  findByEmail(email: string): Promise<StaffRecord | null>;
  findById(id: string): Promise<StaffRecord | null>;
  findByInviteTokenHash(inviteTokenHash: string): Promise<StaffRecord | null>;
  touchLogin(id: string, at: Date): Promise<unknown>;
  acceptInvitation(id: string, passwordHash: string): Promise<unknown>;
}
