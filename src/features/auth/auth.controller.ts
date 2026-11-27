import type { Request, Response } from 'express';
import { SessionExpiredError } from '../../core/errors/AppError.js';
import { clearAuthCookies, readRefreshToken, setAuthCookies } from '../../core/http/authCookies.js';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { AuthService } from './auth.service.js';

export const createAuthController = (service: AuthService) => ({
  async register(req: Request, res: Response) {
    const { customer, tokens } = await service.register(req.body);
    setAuthCookies(res, 'customer', tokens, req);
    return sendSuccess(res, customer, 201, 'Compte créé.');
  },

  async login(req: Request, res: Response) {
    const { customer, tokens } = await service.login(req.body.identifier, req.body.password);
    setAuthCookies(res, 'customer', tokens, req);
    return sendSuccess(res, customer, 200, 'Vous êtes connecté.');
  },

  async refresh(req: Request, res: Response) {
    const token = readRefreshToken(req, 'customer');
    if (!token) throw new SessionExpiredError('customer');
    const { customer, tokens } = await service.refresh(token);
    setAuthCookies(res, 'customer', tokens, req);
    return sendSuccess(res, customer);
  },

  async logout(req: Request, res: Response) {
    const token = readRefreshToken(req, 'customer');
    if (token) await service.logout(token);
    clearAuthCookies(res, 'customer', req);
    return res.status(204).end();
  },

  async changeContact(req: Request, res: Response) {
    const customer = await service.changeContact(req.customer!.id, req.body);
    return sendSuccess(res, customer, 200, 'Coordonnées mises à jour.');
  },

  async me(req: Request, res: Response) {
    return sendSuccess(res, await service.me(req.customer!.id));
  },
});
