import { z } from 'zod';

export const zoneRequestBody = z.strictObject({
  neighbourhood: z.string().trim().min(2, 'Indiquez votre quartier.').max(80),
  city: z.string().trim().min(2).max(60),
  contact: z.string().trim().min(6, 'Indiquez un téléphone ou un e-mail pour vous répondre.').max(120),
});
export type ZoneRequestInput = z.infer<typeof zoneRequestBody>;

export const decideZoneRequestBody = z.strictObject({
  status: z.enum(['added', 'declined']),
  note: z.string().trim().min(3, 'Indiquez la suite donnée.').max(300),
});
export type DecideZoneRequestInput = z.infer<typeof decideZoneRequestBody>;
