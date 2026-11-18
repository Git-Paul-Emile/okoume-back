import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler.js';
import { requireStaff, type StaffAuthenticator } from '../../core/middlewares/authenticate.js';
import { validate } from '../../core/middlewares/validate.js';
import { idParam } from '../../core/validation/common.schemas.js';
import { createStaffTeamController } from './staff-team.controller.js';
import { backupCodeResetBody, customRoleBody, inviteMemberBody, updateMemberBody } from './staff-team.schemas.js';
import type { StaffTeamService } from './staff-team.service.js';

/** Équipe, sous /api/v1/staff/team. */
export const createStaffTeamRoutes = (
  service: StaffTeamService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffTeamController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', asyncHandler(c.list));
  router.get('/directory', asyncHandler(c.directory));
  router.post('/invitations', validate({ body: inviteMemberBody }), asyncHandler(c.invite));
  router.post('/:id/invitations', validate({ params: idParam }), asyncHandler(c.renewInvite));
  router.patch('/:id', validate({ params: idParam, body: updateMemberBody }), asyncHandler(c.update));
  router.post('/:id/session-revocations', validate({ params: idParam }), asyncHandler(c.revokeSessions));
  router.post(
    '/:id/backup-code-resets',
    validate({ params: idParam, body: backupCodeResetBody }),
    asyncHandler(c.resetBackupCodes),
  );
  return router;
};

/** Rôles personnalisés, sous /api/v1/staff/custom-roles. */
export const createCustomRolesRoutes = (
  service: StaffTeamService,
  authenticator: StaffAuthenticator,
  now: () => Date,
) => {
  const c = createStaffTeamController(service);
  const router = Router();
  router.use(requireStaff(authenticator, now));
  router.get('/', asyncHandler(c.customRoles));
  router.post('/', validate({ body: customRoleBody }), asyncHandler(c.createCustomRole));
  router.put('/:id', validate({ params: idParam, body: customRoleBody }), asyncHandler(c.updateCustomRole));
  return router;
};
