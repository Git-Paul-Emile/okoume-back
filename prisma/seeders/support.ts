import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * Identifiant stable dérivé de l'ancien identifiant du json-server : relancer le seed retrouve les mêmes lignes
 * et les relations se reconstruisent sans table de correspondance. Format UUID version 8 (RFC 9562).
 */
export function legacyUuid(scope: string, legacyId: string) {
  // Keep the historical binary namespace so existing seeded UUIDs stay stable.
  const namespace = Buffer.from('6f6b6f756d653a', 'hex');
  const hex = createHash('sha256').update(namespace).update(scope).update(':').update(legacyId).digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Lit un fichier de data/ et le valide : une donnée inattendue arrête le seed avant toute écriture. */
export function readData<T extends z.ZodType>(file: string, schema: T): z.infer<T> {
  const raw: unknown = JSON.parse(readFileSync(new URL(`./data/${file}`, import.meta.url), 'utf-8'));
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error(`data/${file} invalide : ${z.prettifyError(result.error)}`);
  return result.data;
}

export const isoDate = z.iso.datetime().transform((value) => new Date(value));

export interface SeedContext {
  prisma: PrismaClient;
  /** Empreinte Argon2id du mot de passe commun aux comptes de démonstration (SEED_DEMO_PASSWORD) */
  demoPasswordHash(): Promise<string>;
  reportDemoBackupCodes?(email: string, codes: string[]): void;
}

export interface Seeder {
  /** Nom affiché et nom du fichier de data/ concerné */
  name: string;
  /**
   * Données de démonstration (comptes, commandes, catalogue fictif), exclues en production par défaut.
   * Les données de référence (réglages, zones, rôles) sont utilisables partout.
   */
  demo: boolean;
  /** Insère ce qui manque et rend le nombre de lignes créées ; ne modifie jamais une ligne existante. */
  run(context: SeedContext): Promise<number>;
}
