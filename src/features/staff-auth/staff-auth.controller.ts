import type { Request, Response } from 'express';
import { SessionExpiredError } from '../../core/errors/AppError.js';
import { clearAuthCookies, readRefreshToken, setAuthCookies } from '../../core/http/authCookies.js';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { StaffAuthService } from './staff-auth.service.js';

export const createStaffAuthController = (service: StaffAuthService) => ({
  async login(req: Request, res: Response) {
    const { member, tokens } = await service.login(req.body.email, req.body.password);
    setAuthCookies(res, 'staff', tokens, req);
    return sendSuccess(res, { member }, 200, 'Vous êtes connecté.');
  },

  async refresh(req: Request, res: Response) {
    const token = readRefreshToken(req, 'staff');
    if (!token) throw new SessionExpiredError('staff');
    const { member, tokens } = await service.refresh(token);
    setAuthCookies(res, 'staff', tokens, req);
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
    clearAuthCookies(res, 'staff', req);
    return res.status(204).end();
  },

  async me(req: Request, res: Response) {
    return sendSuccess(res, await service.me(req.staff!.id));
  },

  async acceptInvitation(req: Request, res: Response) {
    await service.acceptInvitation(String(req.params.token), req.body.password);
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, null, 200, 'Votre compte est activé. Vous pouvez vous connecter.');
  },
});
