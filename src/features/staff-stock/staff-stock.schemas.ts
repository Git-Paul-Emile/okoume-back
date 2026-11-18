import { z } from 'zod';
import { listQuery } from '../../core/validation/common.schemas.js';

const MAX_UNITS = 100_000;
const reason = z.string().trim().min(3, 'Indiquez le motif du mouvement.').max(300);

/** Réception : quantité ajoutée. Inventaire : quantité comptée, qui remplace le stock enregistré. */
export const stockMovementBody = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('reception'), quantity: z.int().min(1).max(MAX_UNITS), reason }),
  z.strictObject({ type: z.literal('ajustement'), counted: z.int().min(0).max(MAX_UNITS), reason }),
]);

export type StockMovementInput = z.infer<typeof stockMovementBody>;

export const variantParams = z.strictObject({ variantId: z.uuid('Variante invalide.') });

export const listMovementsQuery = listQuery(['createdAt']).pick({ page: true, limit: true }).strict();

export type ListMovementsQuery = z.infer<typeof listMovementsQuery>;

const MOVEMENT_TYPES = [
  'reception',
  'ajustement',
  'commande',
  'annulation',
  'retour',
  'non_vendable',
  'mise_au_rebut',
] as const;

/** Journal général : pagination et type de mouvement facultatif */
export const journalQuery = listQuery(['createdAt'])
  .pick({ page: true, limit: true })
  .extend({ type: z.enum(MOVEMENT_TYPES).optional() })
  .strict();

export type JournalQuery = z.infer<typeof journalQuery>;
