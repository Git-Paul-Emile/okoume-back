import type { Request, Response } from 'express';
import { SessionExpiredError } from '../../core/errors/AppError.js';
import { clearAuthCookies, readRefreshToken, setAuthCookies } from '../../core/http/authCookies.js';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { StaffAuthService } from './staff-auth.service.js';

export const createStaffAuthController = (service: StaffAuthService) => ({
  async requestPasswordReset(req: Request, res: Response) {
    await service.requestPasswordReset(req.body.email);
    return sendSuccess(
      res,
      null,
      202,
      'Si cette adresse correspond à un membre actif, un code vient de lui être envoyé.',
    );
  },

  async confirmPasswordReset(req: Request, res: Response) {
    const { email, code, backupCode, password } = req.body as Record<string, string>;
    await service.confirmPasswordReset(email!, code!, backupCode!, password!);
    return sendSuccess(res, null, 200, 'Mot de passe changé : reconnectez-vous.');
  },

  async startLogin(req: Request, res: Response) {
    const challenge = await service.startLogin(req.body.email, req.body.password);
    return sendSuccess(res, challenge, 202, 'Un code de connexion vous a été envoyé par e-mail.');
  },

  async completeLogin(req: Request, res: Response) {
    const { member, backupCodesLeft, tokens } = await service.completeLogin(req.body.challengeId, {
      code: req.body.code,
      backupCode: req.body.backupCode,
    });
    setAuthCookies(res, 'staff', tokens);
    return sendSuccess(res, { member, backupCodesLeft }, 200, 'Vous êtes connecté.');
  },

  async refresh(req: Request, res: Response) {
    const token = readRefreshToken(req, 'staff');
    if (!token) throw new SessionExpiredError('staff');
    const { member, tokens } = await service.refresh(token);
    setAuthCookies(res, 'staff', tokens);
    return sendSuccess(res, { member });
  },

  async revokeOtherSessions(req: Request, res: Response) {
    const token = readRefreshToken(req, 'staff');
    if (!token) throw new SessionExpiredError('staff');
    await service.revokeOtherSessions(req.staff!.id, token);
    return res.status(204).end();
  },

  async logout(req: Request, res: Response) {
    const token = readRefreshToken(req, 'staff');
    if (token) await service.logout(token);
    clearAuthCookies(res, 'staff');
    return res.status(204).end();
  },

  async me(req: Request, res: Response) {
    return sendSuccess(res, await service.me(req.staff!.id));
  },

  async regenerateBackupCodes(req: Request, res: Response) {
    const result = await service.regenerateBackupCodes(req.staff!.id);
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, result, 201, 'Nouveaux codes de secours : notez-les, ils ne seront plus affichés.');
  },

  async startInvitation(req: Request, res: Response) {
    const result = await service.startInvitation(String(req.params.token));
    return sendSuccess(res, result, 202, 'Un code vous a été envoyé par e-mail.');
  },

  async acceptInvitation(req: Request, res: Response) {
    const result = await service.acceptInvitation(String(req.params.token), req.body.code, req.body.password);
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, result, 200, 'Votre accès est prêt. Notez vos codes de secours.');
  },
});
