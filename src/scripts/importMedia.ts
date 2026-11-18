import { resolve } from 'node:path';
import { env } from '../config/env.js';
import { mediaImportRepository } from '../features/media-import/media-import.repository.js';
import { createMediaImportService } from '../features/media-import/media-import.service.js';
import { selectMediaStorage } from '../infrastructure/media/selectMediaStorage.js';
import { logger } from '../lib/logger.js';

/**
 * Reprise des images existantes chez Cloudinary (npm run media:import), à lancer une fois après le seed puis à
 * chaque import de données qui citent des images hébergées ailleurs. Code de sortie 1 si une image échoue.
 */
const media = selectMediaStorage(env);
if (!media) {
  logger.fatal(
    'Cloudinary non configuré : renseigner CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET',
  );
  process.exit(1);
}
try {
  const result = await createMediaImportService({
    repository: mediaImportRepository,
    media,
    publicDir: resolve(import.meta.dirname, '../../../front/public'),
  }).run();
  logger.info(
    { uploaded: result.uploaded, rows: result.rows, failed: result.failed.length },
    'Reprise des images terminée',
  );
  process.exitCode = result.failed.length ? 1 : 0;
} finally {
  await mediaImportRepository.disconnect();
}
