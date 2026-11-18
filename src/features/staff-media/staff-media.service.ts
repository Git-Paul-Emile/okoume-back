import { ForbiddenError, ServiceUnavailableError } from '../../core/errors/AppError.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { MediaFolder, MediaStorage } from '../../infrastructure/media/mediaStorage.js';

/** Autorisations d'envoi d'images pour le catalogue ; storage vaut null tant que l'hébergement n'est pas configuré. */
export const createStaffMediaService = (storage: MediaStorage | null, now: () => Date) => ({
  signUpload(folder: MediaFolder, actor: Grantee) {
    if (!can(actor, 'catalogue:modifier')) throw new ForbiddenError();
    if (!storage) throw new ServiceUnavailableError('L’envoi d’images n’est pas encore configuré.');
    const upload = storage.signUpload(folder, now());
    return { ...upload, expiresAt: upload.expiresAt.toISOString() };
  },
});

export type StaffMediaService = ReturnType<typeof createStaffMediaService>;
