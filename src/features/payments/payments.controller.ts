import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { PaymentsService } from './payments.service.js';

export const createPaymentsController = (service: PaymentsService) => ({
  async changeMethod(req: Request, res: Response) {
    const order = await service.changeMethod(req.customer!.id, String(req.params.id), req.body.paymentMethod);
    return sendSuccess(res, order, 200, 'Moyen de paiement modifié.');
  },
});
