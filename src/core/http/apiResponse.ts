import type { Response } from 'express';

/** Forme unique d'une réponse réussie. */
export interface SuccessBody<T> {
  success: true;
  status: number;
  message: string;
  data: T;
}

/** Forme unique d'une réponse en erreur. */
export interface ErrorBody {
  success: false;
  status: number;
  message: string;
  code: string;
  requestId?: string;
  errors?: ReadonlyArray<{ field: string; message: string }>;
}

/** Collection paginée (rules/10-stack/api.md). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
}

export function sendSuccess<T>(res: Response, data: T, status = 200, message = 'OK') {
  const body: SuccessBody<T> = { success: true, status, message, data };
  return res.status(status).json(body);
}

export function sendError(res: Response, body: Omit<ErrorBody, 'success'>) {
  const payload: ErrorBody = { success: false, ...body };
  return res.status(body.status).json(payload);
}

export const paginate = <T>(items: T[], total: number, page: number, limit: number): Page<T> => ({
  items,
  total,
  page,
  limit,
  hasNext: page * limit < total,
});
