import { z } from 'zod';
import { planTermsError } from '../../src/features/staff-shops/staff-shops.schemas.js';
import { legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z
    .object({
      id: z.string(),
      name: z.string().min(2),
      description: z.string(),
      kind: z.enum(['free', 'paid']),
      price: z.number().int().min(0),
      periodDays: z.number().int().positive().nullable(),
      trialDays: z.number().int().min(0),
      position: z.number().int().min(0),
    })
    .superRefine((plan, ctx) => {
      const error = planTermsError(plan);
      if (error) ctx.addIssue({ code: 'custom', message: `${plan.name} : ${error}` });
    }),
);

/** Contenu validé de data/access-plans.json */
export const loadAccessPlans = () => readData('access-plans.json', schema);
export const accessPlanId = (legacyId: string) => legacyUuid('access-plan', legacyId);

/**
 * Offres d'accès des boutiques de vendeurs tiers (32.2) : l'offre gratuite de départ. Les offres payantes et
 * leurs prix sont une décision commerciale, créée depuis l'administration.
 */
export const accessPlansSeeder: Seeder = {
  name: 'access-plans',
  demo: false,
  async run({ prisma }) {
    const { count } = await prisma.accessPlan.createMany({
      data: loadAccessPlans().map(({ id, ...plan }) => ({ id: accessPlanId(id), ...plan })),
      skipDuplicates: true,
    });
    return count;
  },
};
