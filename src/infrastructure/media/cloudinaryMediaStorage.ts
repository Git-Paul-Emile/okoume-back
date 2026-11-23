import { createHash } from 'node:crypto';
import type { MediaFolder, MediaStorage, SignedUpload } from './mediaStorage.js';

/** Une signature Cloudinary reste valable une heure après son horodatage. */
const SIGNATURE_TTL_MS = 60 * 60 * 1000;
const IMAGE_FORMATS = 'jpg,jpeg,png,webp,avif';

/**
 * Signature d'une requête Cloudinary : paramètres triés par nom, « nom=valeur » joints par &, secret ajouté
 * à la fin sans séparateur, puis SHA-1 en hexadécimal. api_key, file, cloud_name et resource_type n'en font
 * jamais partie (https://cloudinary.com/documentation/authentication_signatures).
 */
export function signParams(params: Record<string, string>, apiSecret: string) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1')
    .update(payload + apiSecret)
    .digest('hex');
}

/** Délai d'un envoi par le serveur : Cloudinary va chercher l'image lui-même */
const IMPORT_TIMEOUT_MS = 60_000;

export class MediaImportError extends Error {}

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Dossier racine propre à l'environnement (okoza/staging, okoza/production) : un compte, plusieurs sites */
  rootFolder: string;
  /** Remplaçable dans les tests */
  fetch?: typeof globalThis.fetch;
}

export function createCloudinaryMediaStorage({
  cloudName,
  apiKey,
  apiSecret,
  rootFolder,
  fetch = globalThis.fetch,
}: CloudinaryConfig): MediaStorage {
  const deliveryPrefix = `https://res.cloudinary.com/${cloudName}/image/upload/`;
  return {
    signUpload(folder: MediaFolder, now: Date): SignedUpload {
      const timestamp = Math.floor(now.getTime() / 1000);
      // Seuls les paramètres signés sont acceptés par Cloudinary : le navigateur ne peut ni changer de dossier
      // ni envoyer autre chose qu'une image
      const signed = {
        allowed_formats: IMAGE_FORMATS,
        asset_folder: `${rootFolder}/${folder}`,
        timestamp: String(timestamp),
      };
      return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
        fields: { ...signed, api_key: apiKey, signature: signParams(signed, apiSecret) },
        expiresAt: new Date(timestamp * 1000 + SIGNATURE_TTL_MS),
      };
    },
    isHostedUrl: (url) => url.startsWith(deliveryPrefix),

    async importImage(source, folder) {
      // Identifiant tiré de la source : rejouer la reprise retrouve l'image déjà envoyée au lieu d'en créer une autre
      const hash = createHash('sha1').update(source).digest('hex').slice(0, 20);
      const signed = {
        asset_folder: `${rootFolder}/${folder}`,
        overwrite: 'false',
        public_id: `${rootFolder}/${folder}/${hash}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
      };
      const body = new FormData();
      for (const [key, value] of Object.entries(signed)) body.append(key, value);
      body.append('api_key', apiKey);
      body.append('signature', signParams(signed, apiSecret));
      body.append('file', source);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
      });
      const result: unknown = await response.json().catch(() => null);
      const url =
        result && typeof result === 'object' && 'secure_url' in result && typeof result.secure_url === 'string'
          ? result.secure_url
          : null;
      if (!response.ok || !url) throw new MediaImportError(`Reprise refusée par Cloudinary (${response.status})`);
      return url;
    },
  };
}
