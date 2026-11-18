import { prisma } from '../../lib/prisma.js';
import type { StaffRoleName } from '../../core/security/permissions.js';

export interface ActivityRecord {
  id: string;
  staffId: string | null;
  staffName: string;
  role: StaffRoleName;
  area: string;
  action: string;
  method: string;
  path: string;
  status: number;
  createdAt: Date;
}

export type NewActivity = Omit<ActivityRecord, 'id' | 'staffName' | 'role' | 'createdAt'> & { staffId: string };

/** Contrat de stockage du journal d'activité : ajout et lecture, jamais de modification. */
export interface StaffActivityRepository {
  /** Nom et rôle du membre sont figés au moment de l'action. */
  record(entry: NewActivity, at: Date): Promise<void>;
  list(filters: { staffId?: string | undefined; page: number; limit: number }): Promise<{
    items: ActivityRecord[];
    total: number;
  }>;
}

export const staffActivityRepository: StaffActivityRepository = {
  async record(entry, at) {
    const member = await prisma.staffMember.findUnique({
      where: { id: entry.staffId },
      select: { firstName: true, lastName: true, role: true },
    });
    if (!member) return;
    await prisma.staffActivity.create({
      data: { ...entry, staffName: `${member.firstName} ${member.lastName}`, role: member.role, createdAt: at },
    });
  },

  async list({ staffId, page, limit }) {
    const where = staffId ? { staffId } : {};
    const [items, total] = await prisma.$transaction([
      prisma.staffActivity.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.staffActivity.count({ where }),
    ]);
    return { items, total };
  },
};
