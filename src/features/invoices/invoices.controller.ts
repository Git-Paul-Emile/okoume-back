import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import { listInvoicesQuery } from './invoices.schemas.js';
import type { InvoicesService } from './invoices.service.js';

export const createInvoicesController = (service: InvoicesService) => ({
  async forOrder(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.forCustomerOrder(req.customer!.id, String(req.params.id)));
  },

  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    // Query déjà validée par le middleware ; parse redonne son type exact (schéma idempotent)
    return sendSuccess(res, await service.list(listInvoicesQuery.parse(req.query), req.staff!));
  },

  async get(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.get(String(req.params.id), req.staff!));
  },
});
