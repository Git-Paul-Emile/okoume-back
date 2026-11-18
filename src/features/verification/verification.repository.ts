import { prisma } from '../../lib/prisma.js';
import type { VerificationPurpose } from '../../generated/prisma/client.js';

export type { VerificationPurpose };

export interface VerificationRecord {
  id: string;
  subjectId: string;
  target: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
}

const columns = {
  id: true,
  subjectId: true,
  target: true,
  codeHash: true,
  attempts: true,
  expiresAt: true,
  consumedAt: true,
} as const;

export const verificationRepository: VerificationRepository = {
  /** Un nouveau code remplace les précédents encore valides pour le même usage. */
  replace: (
    data: { purpose: VerificationPurpose; subjectId: string; target: string; codeHash: string; expiresAt: Date },
    at: Date,
  ) =>
    prisma.$transaction(async (tx) => {
      await tx.verificationCode.updateMany({
        where: { subjectId: data.subjectId, purpose: data.purpose, consumedAt: null },
        data: { consumedAt: at },
      });
      return tx.verificationCode.create({ data, select: columns });
    }),

  findActive: (subjectId: string, purpose: VerificationPurpose): Promise<VerificationRecord | null> =>
    prisma.verificationCode.findFirst({
      where: { subjectId, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: columns,
    }),

  findById: (id: string, purpose: VerificationPurpose): Promise<VerificationRecord | null> =>
    prisma.verificationCode.findFirst({ where: { id, purpose }, select: columns }),

  incrementAttempts: (id: string) =>
    prisma.verificationCode.update({ where: { id }, data: { attempts: { increment: 1 } }, select: { attempts: true } }),

  /** Consomme le code une seule fois, même en cas de requêtes simultanées. */
  async consume(id: string, at: Date) {
    const result = await prisma.verificationCode.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: at },
    });
    return result.count === 1;
  },
};

/** Contrat de stockage des codes de vérification. */
export interface VerificationRepository {
  replace(
    data: { purpose: VerificationPurpose; subjectId: string; target: string; codeHash: string; expiresAt: Date },
    at: Date,
  ): Promise<VerificationRecord>;
  findActive(subjectId: string, purpose: VerificationPurpose): Promise<VerificationRecord | null>;
  findById(id: string, purpose: VerificationPurpose): Promise<VerificationRecord | null>;
  incrementAttempts(id: string): Promise<{ attempts: number }>;
  consume(id: string, at: Date): Promise<boolean>;
}
