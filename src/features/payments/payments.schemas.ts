import { z } from 'zod';

export const paymentMethodBody = z.strictObject({
  paymentMethod: z.enum(['cash', 'airtel', 'moov'], 'Choisissez un moyen de paiement.'),
});
