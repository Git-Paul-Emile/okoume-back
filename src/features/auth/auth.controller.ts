import type { Request, Response } from 'express';
import { SessionExpiredError } from '../../core/errors/AppError.js';
import { clearAuthCookies, readRefreshToken, setAuthCookies } from '../../core/http/authCookies.js';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { AuthService } from './auth.service.js';

const ACCEPTED = 'Si les informations sont correctes, un code vous a été envoyé par e-mail.';

/** Traduit HTTP vers le service et inversement ; aucune règle métier ici. */
export const createAuthController = (service: AuthService) => ({
  async register(req: Request, res: Response) {
    await service.register(req.body);
    return sendSuccess(res, null, 202, ACCEPTED);
  },

  async resendVerification(req: Request, res: Response) {
    await service.resendVerification(req.body.email);
    return sendSuccess(res, null, 202, ACCEPTED);
  },

  async verifyEmail(req: Request, res: Response) {
    const { customer, tokens } = await service.verifyEmail(req.body.email, req.body.code);
    setAuthCookies(res, 'customer', tokens);
    return sendSuccess(res, customer, 200, 'Adresse e-mail confirmée.');
  },

  async login(req: Request, res: Response) {
    const { customer, tokens } = await service.login(req.body.identifier, req.body.password);
    setAuthCookies(res, 'customer', tokens);
    return sendSuccess(res, customer, 200, 'Vous êtes connecté.');
  },

  async refresh(req: Request, res: Response) {
    const token = readRefreshToken(req, 'customer');
    if (!token) throw new SessionExpiredError('customer');
    const { customer, tokens } = await service.refresh(token);
    setAuthCookies(res, 'customer', tokens);
    return sendSuccess(res, customer);
  },

  async logout(req: Request, res: Response) {
    const token = readRefreshToken(req, 'customer');
    if (token) await service.logout(token);
    clearAuthCookies(res, 'customer');
    return res.status(204).end();
  },

  async requestContactChange(req: Request, res: Response) {
    await service.requestContactChange(req.customer!.id, req.body);
    return sendSuccess(res, null, 202, 'Code envoyé : saisissez-le pour confirmer.');
  },

  async confirmContactChange(req: Request, res: Response) {
    const customer = await service.confirmContactChange(req.customer!.id, req.body.code);
    return sendSuccess(res, customer, 200, 'Coordonnées mises à jour.');
  },

  async me(req: Request, res: Response) {
    return sendSuccess(res, await service.me(req.customer!.id));
  },

  async requestPasswordReset(req: Request, res: Response) {
    await service.requestPasswordReset(req.body.identifier);
    return sendSuccess(res, null, 202, ACCEPTED);
  },

  async confirmPasswordReset(req: Request, res: Response) {
    await service.confirmPasswordReset(req.body.identifier, req.body.code, req.body.password);
    clearAuthCookies(res, 'customer');
    return sendSuccess(res, null, 200, 'Mot de passe modifié. Connectez-vous avec le nouveau.');
  },
});
