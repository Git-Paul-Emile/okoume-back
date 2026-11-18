import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import type { MediaFolder } from '../../infrastructure/media/mediaStorage.js';

/** Colonne d'images : table, colonne, tableau ou non, dossier chez l'hébergeur. */
export interface ImageColumn {
  table: string;
  column: string;
  array: boolean;
  folder: MediaFolder;
}

/** Colonnes d'images de la base. Liste fixe : les identifiants SQL ne viennent jamais d'une saisie. */
export const IMAGE_COLUMNS: readonly ImageColumn[] = [
  { table: 'product_images', column: 'url', array: false, folder: 'products' },
  { table: 'variants', column: 'image', array: false, folder: 'products' },
  { table: 'order_items', column: 'image', array: false, folder: 'products' },
  { table: 'categories', column: 'image', array: false, folder: 'categories' },
  { table: 'home_banners', column: 'image', array: false, folder: 'banners' },
  { table: 'ads', column: 'image', array: false, folder: 'banners' },
  { table: 'ads', column: 'image_mobile', array: false, folder: 'banners' },
  { table: 'articles', column: 'cover', array: false, folder: 'banners' },
  { table: 'product_reviews', column: 'photos', array: true, folder: 'reviews' },
  { table: 'listing_photos', column: 'url', array: false, folder: 'listings' },
  { table: 'return_requests', column: 'evidence_urls', array: true, folder: 'returns' },
  { table: 'support_messages', column: 'attachments', array: true, folder: 'support' },
];

/** Contrat de stockage de la reprise des images. */
export interface MediaImportRepository {
  distinctValues(column: ImageColumn): Promise<string[]>;
  /** Remplace une adresse par une autre partout dans la colonne ; rend le nombre de lignes touchées. */
  replace(column: ImageColumn, from: string, to: string): Promise<number>;
  disconnect(): Promise<void>;
}

const identifiers = ({ table, column }: ImageColumn) => ({
  t: Prisma.raw(`"${table}"`),
  c: Prisma.raw(`"${column}"`),
});

export const mediaImportRepository: MediaImportRepository = {
  async distinctValues(col) {
    const { t, c } = identifiers(col);
    const rows = col.array
      ? await prisma.$queryRaw<Array<{ value: string }>>`SELECT DISTINCT unnest(${c}) AS value FROM ${t}`
      : await prisma.$queryRaw<Array<{ value: string | null }>>`SELECT DISTINCT ${c} AS value FROM ${t}`;
    return rows.flatMap((r) => (r.value ? [r.value] : []));
  },

  replace(col, from, to) {
    const { t, c } = identifiers(col);
    return col.array
      ? prisma.$executeRaw`UPDATE ${t} SET ${c} = array_replace(${c}, ${from}, ${to}) WHERE ${from} = ANY(${c})`
      : prisma.$executeRaw`UPDATE ${t} SET ${c} = ${to} WHERE ${c} = ${from}`;
  },

  disconnect: () => prisma.$disconnect(),
};
