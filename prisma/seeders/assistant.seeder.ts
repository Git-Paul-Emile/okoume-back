import { z } from 'zod';
import { isoDate, legacyUuid, readData, type Seeder } from './support.js';

const schema = z.array(
  z.object({
    id: z.string(),
    version: z.number().int().min(1),
    params: z.object({
      slowDays: z.number().int().min(14).max(365),
      slowDiscount: z.number().int().min(5).max(50),
      promoDays: z.number().int().min(7).max(90),
      minStock: z.number().int().min(1),
    }),
    note: z.string().min(1),
    by: z.string().min(1),
    at: isoDate,
  }),
);

/** Contenu validé de data/assistant-rules.json */
export const loadAssistantRules = () => readData('assistant-rules.json', schema);

/** Paramètres d'origine de l'assistant d'administration : donnée de référence, chargée partout. */
export const assistantSeeder: Seeder = {
  name: 'assistant-rules',
  demo: false,
  async run({ prisma }) {
    const { count } = await prisma.assistantRulesVersion.createMany({
      data: loadAssistantRules().map((v) => ({
        id: legacyUuid('assistant-rules', v.id),
        version: v.version,
        params: v.params,
        note: v.note,
        staffName: v.by,
        createdAt: v.at,
      })),
      skipDuplicates: true,
    });
    return count;
  },
};
