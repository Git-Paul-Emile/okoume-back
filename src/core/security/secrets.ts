import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Jeton opaque (renouvellement de session, invitation) : 256 bits aléatoires. */
export const randomToken = () => randomBytes(32).toString('base64url');

/**
 * Empreinte SHA-256 d'un jeton ou d'un code : seule l'empreinte est stockée en base.
 * Suffisant pour des secrets aléatoires à forte entropie ; les mots de passe utilisent Argon2id.
 */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Lettres et chiffres lisibles au téléphone : ni 0 et O, ni 1 et I. */
const READABLE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Code aléatoire lisible : numéro de commande, code de suivi. */
export const randomReadableCode = (length: number) =>
  Array.from({ length }, () => READABLE_ALPHABET[randomInt(0, READABLE_ALPHABET.length)]).join('');

