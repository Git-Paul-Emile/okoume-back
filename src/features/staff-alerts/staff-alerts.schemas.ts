import { z } from 'zod';

export const updateAlertBody = z
  .strictObject({
    state: z.enum(['in_progress', 'resolved', 'closed']),
    assigneeId: z.uuid().nullable(),
    closureReason: z.string().trim().max(500),
    actionTaken: z.string().trim().max(500),
  })
  .partial()
  .refine((v) => v.state !== undefined || v.assigneeId !== undefined, 'Aucune modification.');
export type UpdateAlertInput = z.infer<typeof updateAlertBody>;
