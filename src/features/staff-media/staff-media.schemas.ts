import { z } from 'zod';
import { MEDIA_FOLDERS } from '../../infrastructure/media/mediaStorage.js';

/** Dossier de destination de l'image ; le reste de l'envoi est fixé et signé par l'API. */
export const uploadSignatureBody = z.strictObject({
  folder: z.enum(MEDIA_FOLDERS.filter((f) => f !== 'reviews')),
});
