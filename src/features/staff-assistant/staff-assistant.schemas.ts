import { z } from 'zod';

const proposalId = z.string().trim().min(1).max(120);

export const decisionBody = z
  .strictObject({
    proposalId,
    decision: z.enum(['accepted', 'refused', 'postponed', 'executed']),
    reason: z.string().trim().min(3).max(500).optional(),
    until: z.iso
      .datetime({ offset: true })
      .transform((v) => new Date(v))
      .optional(),
  })
  .refine((d) => d.decision !== 'refused' || d.reason, { message: 'Indiquez le motif du refus.', path: ['reason'] })
  .refine((d) => d.decision !== 'postponed' || d.until, { message: 'Indiquez la date du report.', path: ['until'] });
export type DecisionInput = z.infer<typeof decisionBody>;

/** Seuls « mis en avant » et la promotion peuvent changer par une proposition. */
const productPatch = z.strictObject({
  featured: z.boolean().optional(),
});

export const actionBody = z.strictObject({
  proposalId,
  title: z.string().trim().min(3).max(200),
  changes: z
    .array(
      z.strictObject({
        productId: z.uuid(),
        label: z.string().trim().min(1).max(200),
        before: productPatch,
        after: productPatch,
      }),
    )
    .min(1)
    .max(200),
});
export type ActionInput = z.infer<typeof actionBody>;

/** Mêmes bornes que l'écran des règles (17.5). */
export const rulesBody = z.strictObject({
  params: z.strictObject({
    slowDays: z.int().min(14).max(365),
    slowDiscount: z.int().min(5).max(50),
    promoDays: z.int().min(7).max(90),
    minStock: z.int().min(1).max(100_000),
  }),
  note: z.string().trim().min(3).max(300),
});
export type RulesInput = z.infer<typeof rulesBody>;

export const questionBody = z.strictObject({
  question: z.string().trim().min(1).max(1_000),
  answer: z.string().trim().min(1).max(5_000),
  source: z.string().trim().max(200),
});
export type QuestionInput = z.infer<typeof questionBody>;
