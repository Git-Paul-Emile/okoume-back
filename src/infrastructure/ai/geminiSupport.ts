import { ApiError, type Part } from '@google/genai';
import { logger } from '../../lib/logger.js';

const PHOTO_TIMEOUT_MS = 10_000;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Limite de débit, panne du fournisseur ou réseau : la file reprendra plus tard. */
export const isTransientGeminiError = (error: unknown) =>
  (error instanceof ApiError && (error.status === 429 || error.status >= 500)) || error instanceof TypeError;

/**
 * Photos d'annonce envoyées au modèle en données : le serveur les télécharge lui-même, et seulement depuis
 * l'hébergeur d'images de la boutique (photoPrefix). Une adresse quelconque n'est jamais appelée : un serveur qui
 * télécharge ce qu'on lui donne peut être dirigé vers le réseau interne (SSRF). Sans hébergeur configuré, la
 * vérification se fait sur le texte seul.
 */
export async function photoParts(urls: string[], photoPrefix: string | null): Promise<Part[]> {
  if (!photoPrefix) return [];
  const parts: Part[] = [];
  for (const url of urls) {
    if (!url.startsWith(photoPrefix)) continue;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS), redirect: 'error' });
      const mimeType = response.headers.get('content-type')?.split(';')[0] ?? '';
      if (!response.ok || !mimeType.startsWith('image/')) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > PHOTO_MAX_BYTES) continue;
      parts.push({ inlineData: { mimeType, data: bytes.toString('base64') } });
    } catch (err) {
      logger.warn({ err }, 'Photo d’annonce non récupérée pour la vérification');
    }
  }
  return parts;
}

/** JSON renvoyé par le modèle, ou null s'il est absent ou illisible. */
export function parseJson(text: string | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
