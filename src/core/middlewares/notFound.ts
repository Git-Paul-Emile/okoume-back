import type { RequestHandler } from 'express';
import { NotFoundError } from '../errors/AppError.js';

/** Route inconnue : erreur 404 au format standard, traitée par le middleware d'erreur. */
export const notFound: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError('Cette adresse de l’API n’existe pas.'));
};
