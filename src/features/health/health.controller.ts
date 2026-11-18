import type { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../core/http/apiResponse.js';
import type { LivenessDto } from './health.dto.js';
import type { HealthService } from './health.service.js';

export const createHealthController = (service: HealthService) => ({
  /** Sonde de vie : le processus répond, sans dépendance externe. */
  live(_req: Request, res: Response) {
    const body: LivenessDto = { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, body);
  },

  /** Sonde de disponibilité : 503 tant qu'une dépendance critique ne répond pas. */
  async ready(req: Request, res: Response) {
    const result = await service.readiness();
    res.setHeader('Cache-Control', 'no-store');
    if (result.ready) return sendSuccess(res, result);
    req.log.warn({ checks: result.checks }, 'Application non prête');
    return sendError(res, {
      status: 503,
      message: 'Service momentanément indisponible.',
      code: 'NOT_READY',
      requestId: String(req.id ?? ''),
    });
  },
});
