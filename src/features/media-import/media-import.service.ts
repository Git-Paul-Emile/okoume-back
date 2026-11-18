import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { MediaStorage } from '../../infrastructure/media/mediaStorage.js';
import { logger } from '../../lib/logger.js';
import { IMAGE_COLUMNS, type ImageColumn, type MediaImportRepository } from './media-import.repository.js';

const MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};
const CONCURRENCY = 4;

/**
 * Source envoyable à l'hébergeur : une adresse HTTPS telle quelle, un fichier du site (/ads/…) lu dans son dossier
 * public et mis en data URI ; null pour tout le reste (le chemin ne sort jamais du dossier public).
 */
export async function sourceOf(value: string, publicDir: string) {
  if (/^https:\/\//.test(value)) return value;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  const file = resolve(publicDir, `.${value}`);
  const mime = MIME[extname(file).toLowerCase()];
  if (!file.startsWith(resolve(publicDir)) || !mime) return null;
  return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
}

/**
 * Reprise des images existantes chez l'hébergeur : chaque image encore servie ailleurs est envoyée une fois, puis
 * toutes les lignes qui la citent sont réécrites. Rejouable : une image déjà hébergée est ignorée.
 */
export const createMediaImportService = (deps: {
  repository: MediaImportRepository;
  media: MediaStorage;
  publicDir: string;
  columns?: readonly ImageColumn[];
}) => {
  const { repository, media, publicDir, columns = IMAGE_COLUMNS } = deps;
  return {
    async run() {
      const hosted = new Map<string, string>();
      const failed: string[] = [];
      let rows = 0;
      for (const col of columns) {
        const pending = (await repository.distinctValues(col)).filter((v) => !media.isHostedUrl(v));
        for (let i = 0; i < pending.length; i += CONCURRENCY) {
          await Promise.all(
            pending.slice(i, i + CONCURRENCY).map(async (value) => {
              try {
                let url = hosted.get(value);
                if (!url) {
                  const source = await sourceOf(value, publicDir);
                  if (!source) throw new Error('Source illisible : ni adresse HTTPS ni fichier du site');
                  url = await media.importImage(source, col.folder);
                  hosted.set(value, url);
                }
                rows += await repository.replace(col, value, url);
              } catch (err) {
                failed.push(value);
                logger.warn({ err, table: col.table, column: col.column, value }, 'Image non reprise');
              }
            }),
          );
        }
        logger.info({ table: col.table, column: col.column, images: pending.length }, 'Colonne reprise');
      }
      return { uploaded: hosted.size, rows, failed };
    },
  };
};
