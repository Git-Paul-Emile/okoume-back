import argon2 from 'argon2';

/**
 * Hachage des mots de passe en Argon2id (rules/20-qualite/security.md). Paramètres par défaut de la bibliothèque
 * (64 Mio, 3 passes), conformes aux recommandations OWASP actuelles.
 */
export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });

export async function verifyPassword(hash: string, password: string) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Empreinte illisible : refus, sans révéler la raison
    return false;
  }
}

/**
 * Empreinte factice vérifiée quand le compte n'existe pas : la réponse prend le même temps,
 * ce qui empêche de deviner les comptes existants par la durée de la réponse.
 */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword('compte-inexistant');
  await verifyPassword(await dummyHash, password);
  return false;
}
