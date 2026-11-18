import { prisma } from '../../lib/prisma.js';

export type SessionOwner = { customerId: string } | { staffId: string };

export interface SessionRecord {
  id: string;
  familyId: string;
  customerId: string | null;
  staffId: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

export interface LoginAttempt {
  subjectType: 'customer' | 'staff';
  subjectId: string | null;
  success: boolean;
  reason?: string;
}

const sessionColumns = {
  id: true,
  familyId: true,
  customerId: true,
  staffId: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
} as const;

export const sessionsRepository: SessionsRepository = {
  create: (data: { familyId: string; tokenHash: string; expiresAt: Date } & SessionOwner) =>
    prisma.session.create({ data, select: sessionColumns }),

  findByTokenHash: (tokenHash: string): Promise<SessionRecord | null> =>
    prisma.session.findUnique({ where: { tokenHash }, select: sessionColumns }),

  /**
   * Marque le jeton comme utilisé seulement s'il ne l'est pas déjà : deux renouvellements simultanés
   * avec le même jeton ne peuvent pas réussir tous les deux.
   */
  async markUsed(id: string, at: Date) {
    const result = await prisma.session.updateMany({
      where: { id, usedAt: null, revokedAt: null },
      data: { usedAt: at },
    });
    return result.count === 1;
  },

  revokeFamily: (familyId: string, at: Date) =>
    prisma.session.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: at } }),

  revokeAllFor: (owner: SessionOwner, at: Date) =>
    prisma.session.updateMany({ where: { ...owner, revokedAt: null }, data: { revokedAt: at } }),

  revokeOthersFor: (owner: SessionOwner, keepFamilyId: string, at: Date) =>
    prisma.session.updateMany({
      where: { ...owner, revokedAt: null, familyId: { not: keepFamilyId } },
      data: { revokedAt: at },
    }),

  recordLogin: (data: LoginAttempt) => prisma.loginEvent.create({ data, select: { id: true } }),

  countRecentFailures: (subjectType: 'customer' | 'staff', subjectId: string, since: Date) =>
    prisma.loginEvent.count({ where: { subjectType, subjectId, success: false, createdAt: { gte: since } } }),
};

/** Contrat de stockage des sessions : les services en dépendent, Prisma l'implémente. */
export interface SessionsRepository {
  create(data: { familyId: string; tokenHash: string; expiresAt: Date } & SessionOwner): Promise<unknown>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  markUsed(id: string, at: Date): Promise<boolean>;
  revokeFamily(familyId: string, at: Date): Promise<unknown>;
  revokeAllFor(owner: SessionOwner, at: Date): Promise<unknown>;
  /** Toutes les sessions du compte sauf celle en cours (sa famille de jetons). */
  revokeOthersFor(owner: SessionOwner, keepFamilyId: string, at: Date): Promise<unknown>;
  recordLogin(data: LoginAttempt): Promise<unknown>;
  countRecentFailures(subjectType: 'customer' | 'staff', subjectId: string, since: Date): Promise<number>;
}
