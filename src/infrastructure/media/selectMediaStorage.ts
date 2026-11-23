import type { Env } from '../../config/env.js';
import { createCloudinaryMediaStorage } from './cloudinaryMediaStorage.js';
import type { MediaStorage } from './mediaStorage.js';

/**
 * Hébergement configuré, ou null : l'envoi d'images est alors indisponible (503) et les adresses HTTPS
 * saisies à la main restent possibles.
 */
export const selectMediaStorage = (
  config: Pick<Env, 'NODE_ENV' | 'CLOUDINARY_CLOUD_NAME' | 'CLOUDINARY_API_KEY' | 'CLOUDINARY_API_SECRET'>,
): MediaStorage | null =>
  config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET
    ? createCloudinaryMediaStorage({
        cloudName: config.CLOUDINARY_CLOUD_NAME,
        apiKey: config.CLOUDINARY_API_KEY,
        apiSecret: config.CLOUDINARY_API_SECRET,
        rootFolder: `okoza/${config.NODE_ENV}`,
      })
    : null;
