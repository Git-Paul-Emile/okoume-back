import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/apiResponse.js';
import type { StaffMediaService } from './staff-media.service.js';

export const createStaffMediaController = (service: StaffMediaService) => ({
  async signUpload(req: Request, res: Response) {
    // Une signature ne se met jamais en cache : elle porte un horodatage et vaut une heure
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, service.signUpload(req.body.folder, req.staff!), 201, 'Autorisation d’envoi créée.');
  },
});
