import type { NextFunction, Request, Response } from 'express';
import { logger } from '../../lib/logger.js';
import { EXPORTS_PATH, WRITE_METHODS, type StaffActivityService } from './staff-activity.service.js';

/**
 * Inscrit au journal chaque écriture réussie d'un membre de l'équipe, une fois la réponse envoyée : le membre est
 * alors connu (posé par l'authentification de la route) et l'issue aussi. Un échec d'écriture du journal est
 * journalisé sans jamais faire échouer la requête déjà servie.
 */
export const recordStaffActivity =
  (service: StaffActivityService) => (req: Request, res: Response, next: NextFunction) => {
    // Monté sous /staff : req.path est la suite de l'adresse, sans paramètres de requête
    const path = `/staff${req.path}`;
    if (WRITE_METHODS.has(req.method) && path !== EXPORTS_PATH) {
      res.on('finish', () => {
        const staffId = req.staff?.id;
        if (!staffId || res.statusCode >= 400) return;
        service.record(staffId, req.method, path, res.statusCode).catch((err: unknown) => {
          logger.error({ err, staffId, path }, 'Journal d’activité non écrit');
        });
      });
    }
    next();
  };
