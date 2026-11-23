import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { StaffTeamService } from './staff-team.service.js';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. Liens d'invitation : jamais en cache. */
export const createStaffTeamController = (service: StaffTeamService) => ({
  async list(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.list(req.staff!));
  },
  async invite(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.invite(req.body, req.staff!), 201, 'Invitation envoyée.');
  },
  async renewInvite(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, await service.renewInvite(String(req.params.id), req.staff!), 201, 'Nouveau lien envoyé.');
  },
  async update(req: Request, res: Response) {
    return sendSuccess(
      res,
      await service.update(String(req.params.id), req.body, req.staff!),
      200,
      'Membre mis à jour.',
    );
  },
  async revokeSessions(req: Request, res: Response) {
    await service.revokeSessions(String(req.params.id), req.staff!);
    return res.status(204).end();
  },
  async resetBackupCodes(req: Request, res: Response) {
    await service.resetBackupCodes(String(req.params.id), req.body.reason, req.staff!);
    return res.status(204).end();
  },
});
