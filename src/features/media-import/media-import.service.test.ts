import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeMediaStorage } from '../../infrastructure/media/fakeMediaStorage.js';
import type { ImageColumn, MediaImportRepository } from './media-import.repository.js';
import { createMediaImportService, sourceOf } from './media-import.service.js';

const products: ImageColumn = { table: 'product_images', column: 'url', array: false, folder: 'products' };
const ads: ImageColumn = { table: 'ads', column: 'image', array: false, folder: 'banners' };

/** Base en mémoire : une liste d'adresses par colonne. */
function memory(data: Record<string, string[]>) {
  const repository: MediaImportRepository = {
    distinctValues: async (col) => [...new Set(data[col.table] ?? [])],
    async replace(col, from, to) {
      const list = data[col.table] ?? [];
      const count = list.filter((v) => v === from).length;
      data[col.table] = list.map((v) => (v === from ? to : v));
      return count;
    },
    disconnect: async () => undefined,
  };
  return repository;
}

describe('reprise des images chez l’hébergeur', () => {
  it('envoie chaque image une fois, réécrit toutes ses lignes et ignore celles déjà hébergées', async () => {
    const publicDir = await mkdtemp(join(tmpdir(), 'okoza-public-'));
    await mkdir(join(publicDir, 'ads'));
    await writeFile(join(publicDir, 'ads', 'promo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const data = {
      product_images: ['https://cdn.example/a.jpg', 'https://cdn.example/a.jpg', 'https://medias.test/products/x'],
      ads: ['/ads/promo.svg', 'javascript:alert(1)'],
    };
    const result = await createMediaImportService({
      repository: memory(data),
      media: createFakeMediaStorage(),
      publicDir,
      columns: [products, ads],
    }).run();
    expect(result).toMatchObject({ uploaded: 2, rows: 3, failed: ['javascript:alert(1)'] });
    expect(data.product_images.every((v) => v.startsWith('https://medias.test/'))).toBe(true);
    expect(data.ads[0]).toMatch(/^https:\/\/medias\.test\/banners\//);
  });

  it('ne lit jamais un fichier hors du dossier public', async () => {
    const publicDir = await mkdtemp(join(tmpdir(), 'okoza-public-'));
    expect(await sourceOf('/../secret.png', publicDir)).toBeNull();
    expect(await sourceOf('http://cdn.example/a.jpg', publicDir)).toBeNull();
  });
});
