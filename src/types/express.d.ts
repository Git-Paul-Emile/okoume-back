import type { Grantee } from '../core/security/permissions.js';

/** Identité de l'appelant, posée par les middlewares d'authentification. */
declare global {
  namespace Express {
    interface Request {
      customer?: { id: string };
      staff?: Grantee & { id: string; sessionIssuedAt: Date; refundLimit: number | null };
    }
  }
}

export {};
