import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { createStaffMediaController } from './staff-media.controller.js';
import { uploadSignatureBody } from './staff-media.schemas.js';
import type { StaffMediaService } from './staff-media.service.js';

/** Envoi d'images, sous /api/v1/staff/media ; droit catalogue:modifier vérifié par le service. */
export const createStaffMediaRoutes = (
  service: StaffMediaService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffMediaController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.post('/upload-signatures', validate({ body: uploadSignatureBody }), asyncHandler(c.signUpload));
  return router;
};
