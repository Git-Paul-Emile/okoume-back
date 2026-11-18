import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { ValidationError } from '../errors/AppError.js';
import { installFrenchMessages } from '../validation/zodMessages.js';

// Messages de validation clairs, en français, renvoyés aux formulaires (jamais « Invalid input »)
installFrenchMessages();

interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

const toDetails = (error: z.ZodError) =>
  error.issues.map((issue) => ({ field: issue.path.join('.') || 'requête', message: issue.message }));

/**
 * Valide le corps, la query et les paramètres avant le contrôleur. Les valeurs sont remplacées par
 * leur version validée : un champ non déclaré dans un schéma strict est refusé (protection Mass Assignment).
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    const errors: Array<{ field: string; message: string }> = [];
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        errors.push(...toDetails(result.error));
        continue;
      }
      // req.query est un accesseur en lecture seule dans Express 5 : on le redéfinit avec la valeur validée
      Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true, enumerable: true });
    }
    next(errors.length ? new ValidationError(errors) : undefined);
  };
