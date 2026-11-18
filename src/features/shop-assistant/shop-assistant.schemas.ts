import { z } from 'zod';

const turn = z.strictObject({
  from: z.enum(['client', 'assistant']),
  text: z.string().trim().min(1).max(2_000),
});

/** Question du client, avec les derniers échanges pour garder le fil de la conversation */
export const assistantMessageBody = z.strictObject({
  message: z.string().trim().min(1, 'Posez votre question.').max(1_000, '1 000 caractères au maximum.'),
  history: z.array(turn).max(12).default([]),
  productSlug: z.string().trim().min(1).max(160).optional(),
});
