import { createHash } from 'node:crypto';
import type { MediaFolder, MediaStorage, SignedUpload } from './mediaStorage.js';

/** Implémentation de test : signature factice, aucune clé ni appel réseau. */
export function createFakeMediaStorage(): MediaStorage {
  return {
    signUpload(folder: MediaFolder, now: Date): SignedUpload {
      return {
        uploadUrl: 'https://medias.test/upload',
        fields: { folder, timestamp: String(Math.floor(now.getTime() / 1000)), signature: 'signature-de-test' },
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      };
    },
    isHostedUrl: (url) => url.startsWith('https://medias.test/'),
    importImage: async (source, folder) =>
      `https://medias.test/${folder}/${createHash('sha1').update(source).digest('hex').slice(0, 16)}`,
  };
}
