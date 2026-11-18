import { UnprocessableError } from '../../core/errors/AppError.js';
import { randomCode, safeEqual, sha256 } from '../../core/security/secrets.js';
import type { VerificationPurpose, VerificationRecord, VerificationRepository } from './verification.repository.js';

export const CODE_LIFETIME_MS = 10 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;

export const createVerificationService = (repository: VerificationRepository, now: () => Date) => {
  async function check(record: VerificationRecord | null, code: string) {
    const at = now();
    if (!record || record.consumedAt || record.expiresAt <= at)
      throw new UnprocessableError('Code expiré : demandez-en un nouveau.');
    if (record.attempts >= MAX_CODE_ATTEMPTS) throw new UnprocessableError('Trop d’essais : demandez un nouveau code.');
    if (!safeEqual(record.codeHash, sha256(code.trim()))) {
      const { attempts } = await repository.incrementAttempts(record.id);
      const left = MAX_CODE_ATTEMPTS - attempts;
      throw new UnprocessableError(
        left > 0
          ? `Code incorrect. ${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}.`
          : 'Trop d’essais : demandez un nouveau code.',
      );
    }
    if (!(await repository.consume(record.id, at))) throw new UnprocessableError('Code déjà utilisé.');
    return record;
  }

  return {
    /** Crée un code et renvoie sa valeur en clair, à transmettre uniquement par e-mail ou SMS. */
    async issue(purpose: VerificationPurpose, subjectId: string, target: string) {
      const code = randomCode();
      const at = now();
      const record = await repository.replace(
        { purpose, subjectId, target, codeHash: sha256(code), expiresAt: new Date(at.getTime() + CODE_LIFETIME_MS) },
        at,
      );
      return { code, challengeId: record.id };
    },

    /** Vérifie le dernier code émis pour ce compte et cet usage. */
    verifyLatest: async (subjectId: string, purpose: VerificationPurpose, code: string) =>
      check(await repository.findActive(subjectId, purpose), code),

    /**
     * Défi encore ouvert (non consommé, non expiré, essais restants), pour le valider autrement
     * qu'avec le code reçu, par exemple avec un code de secours.
     */
    async findOpenChallenge(challengeId: string, purpose: VerificationPurpose) {
      const record = await repository.findById(challengeId, purpose);
      if (!record || record.consumedAt || record.expiresAt <= now() || record.attempts >= MAX_CODE_ATTEMPTS)
        throw new UnprocessableError('Code expiré : reconnectez-vous.');
      return record;
    },

    /** Essai manqué sur un défi : compte comme un mauvais code. */
    recordFailedAttempt: (challengeId: string) => repository.incrementAttempts(challengeId),

    closeChallenge: (challengeId: string) => repository.consume(challengeId, now()),

    /** Vérifie un code désigné par son identifiant de défi (connexion de l'équipe). */
    verifyChallenge: async (challengeId: string, purpose: VerificationPurpose, code: string) =>
      check(await repository.findById(challengeId, purpose), code),
  };
};

export type VerificationService = ReturnType<typeof createVerificationService>;
