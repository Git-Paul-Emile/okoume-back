import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Transmet au middleware d'erreur toute exception d'un contrôleur asynchrone.
 * Express 5 le fait déjà nativement ; ce wrapper garde un contrat explicite et indépendant de la version.
 */
export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };
