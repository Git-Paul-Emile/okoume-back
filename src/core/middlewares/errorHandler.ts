import type { ErrorRequestHandler } from 'express';
import { AppError, SessionExpiredError } from '../errors/AppError.js';
import { clearAuthCookies } from '../http/authCookies.js';
import { sendError } from '../http/apiResponse.js';

/** Corps JSON illisible ou trop volumineux, signalés par le parseur d'Express. */
const parserError = (error: unknown): { status: number; message: string } | null => {
  if (typeof error !== 'object' || error === null || !('type' in error)) return null;
  if (error.type === 'entity.parse.failed') return { status: 400, message: 'Le corps de la requête est illisible.' };
  if (error.type === 'entity.too.large') return { status: 413, message: 'Le corps de la requête est trop volumineux.' };
  return null;
};

/**
 * Dernier middleware de la chaîne : traduit toute erreur en réponse HTTP standard.
 * Une erreur imprévue est journalisée avec son contexte et renvoie un message générique,
 * sans stack trace ni détail interne.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = String(req.id ?? '');
  if (error instanceof AppError) {
    // Session refusée : les cookies devenus inutiles sont effacés
    if (error instanceof SessionExpiredError) clearAuthCookies(res, error.audience);
    if (error.status >= 500) req.log.error({ err: error }, error.message);
    return sendError(res, {
      status: error.status,
      message: error.message,
      code: error.code,
      requestId,
      ...(error.details ? { errors: error.details } : {}),
    });
  }
  const parsing = parserError(error);
  if (parsing) return sendError(res, { ...parsing, code: 'BAD_REQUEST', requestId });

  req.log.error({ err: error }, 'Erreur imprévue');
  return sendError(res, {
    status: 500,
    message: 'Une erreur est survenue. Réessayez dans un instant.',
    code: 'INTERNAL_ERROR',
    requestId,
  });
};
