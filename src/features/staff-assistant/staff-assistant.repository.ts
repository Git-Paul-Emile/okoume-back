import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export type DecisionKind = 'accepted' | 'refused' | 'postponed' | 'executed';

export interface DecisionRecord {
  id: string;
  proposalId: string;
  decision: DecisionKind;
  reason: string | null;
  until: Date | null;
  staffName: string;
  createdAt: Date;
}

/** Type et non interface : une modification doit pouvoir s'enregistrer telle quelle en JSON. */
export type ProductPatch = {
  featured?: boolean;
  promotion?: { type: 'percent' | 'fixed'; value: number; startsAt: string; endsAt: string } | null;
};
export type ActionChange = { productId: string; label: string; before: ProductPatch; after: ProductPatch };

export interface ActionRecord {
  id: string;
  proposalId: string;
  title: string;
  changes: ActionChange[];
  appliedByName: string;
  appliedAt: Date;
  revertedAt: Date | null;
  revertedByName: string | null;
}

export type AssistantParams = { slowDays: number; slowDiscount: number; promoDays: number; minStock: number };

export interface RulesVersionRecord {
  id: string;
  version: number;
  params: AssistantParams;
  note: string;
  staffName: string;
  createdAt: Date;
}

export interface QuestionRecord {
  id: string;
  question: string;
  answer: string;
  source: string;
  staffName: string;
  createdAt: Date;
}

/** Contrat de stockage de l'assistant d'administration. */
export interface StaffAssistantRepository {
  decisions(): Promise<DecisionRecord[]>;
  addDecision(d: Omit<DecisionRecord, 'id' | 'createdAt'>): Promise<DecisionRecord>;
  actions(): Promise<ActionRecord[]>;
  addAction(a: Omit<ActionRecord, 'id' | 'appliedAt' | 'revertedAt' | 'revertedByName'>): Promise<ActionRecord>;
  /** null : action introuvable ou déjà annulée. */
  revertAction(id: string, staffName: string, at: Date): Promise<ActionRecord | null>;
  rulesVersions(): Promise<RulesVersionRecord[]>;
  /** null : ce numéro de version vient d'être pris, à retenter. */
  addRulesVersion(v: Omit<RulesVersionRecord, 'id' | 'createdAt'>): Promise<RulesVersionRecord | null>;
  questions(): Promise<QuestionRecord[]>;
  addQuestion(q: Omit<QuestionRecord, 'id' | 'createdAt'>): Promise<QuestionRecord>;
  staffName(id: string): Promise<string | null>;
}

const patchDto = z.object({
  featured: z.boolean().optional(),
  promotion: z
    .object({ type: z.enum(['percent', 'fixed']), value: z.number(), startsAt: z.string(), endsAt: z.string() })
    .nullable()
    .optional(),
});
export const changesDto = z.array(
  z.object({ productId: z.string(), label: z.string(), before: patchDto, after: patchDto }),
);
const paramsDto = z.object({
  slowDays: z.number(),
  slowDiscount: z.number(),
  promoDays: z.number(),
  minStock: z.number(),
});

// JSON écrit uniquement par ce dépôt : une forme inattendue est une erreur à signaler, pas à masquer
const toAction = (a: Prisma.AssistantActionGetPayload<object>): ActionRecord => ({
  ...a,
  changes: changesDto.parse(a.changes),
});
const toVersion = (v: Prisma.AssistantRulesVersionGetPayload<object>): RulesVersionRecord => ({
  ...v,
  params: paramsDto.parse(v.params),
});

const RECENT = 500;

export const staffAssistantRepository: StaffAssistantRepository = {
  decisions: () => prisma.assistantDecision.findMany({ orderBy: { createdAt: 'desc' }, take: RECENT }),

  addDecision: (d) => prisma.assistantDecision.create({ data: d }),

  actions: async () =>
    (await prisma.assistantAction.findMany({ orderBy: { appliedAt: 'desc' }, take: RECENT })).map(toAction),

  addAction: async (a) => toAction(await prisma.assistantAction.create({ data: a })),

  async revertAction(id, staffName, at) {
    const result = await prisma.assistantAction.updateMany({
      where: { id, revertedAt: null },
      data: { revertedAt: at, revertedByName: staffName },
    });
    if (!result.count) return null;
    const action = await prisma.assistantAction.findUnique({ where: { id } });
    return action ? toAction(action) : null;
  },

  rulesVersions: async () =>
    (await prisma.assistantRulesVersion.findMany({ orderBy: { version: 'desc' } })).map(toVersion),

  async addRulesVersion(v) {
    try {
      return toVersion(await prisma.assistantRulesVersion.create({ data: v }));
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  questions: () => prisma.assistantQuestion.findMany({ orderBy: { createdAt: 'desc' }, take: RECENT }),

  addQuestion: (q) => prisma.assistantQuestion.create({ data: q }),

  staffName: async (id) => {
    const m = await prisma.staffMember.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
    return m ? `${m.firstName} ${m.lastName}` : null;
  },
};
