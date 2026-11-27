import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee } from '../../core/security/permissions.js';
import type { PromoCodeRecord, PromoCodesRepository } from '../promo-codes/promo-codes.repository.js';
import type { CreatePromoCodeInput, ListPromoCodesQuery, UpdatePromoCodeInput } from './staff-promo-codes.schemas.js';

const CODE_TAKEN = 'Ce code existe déjà.';

/** Codes en majuscules, quelle que soit la saisie : « bienvenue » et « BIENVENUE » sont le même code. */
const normalizeCode = (code: string) => code.trim().toUpperCase();

const toDto = (p: PromoCodeRecord) => ({
  ...p,
  startsAt: p.startsAt.toISOString(),
  endsAt: p.endsAt.toISOString(),
  createdAt: p.createdAt.toISOString(),
});

/** Codes promotionnels côté équipe (page Promotions) : lecture catalogue:consulter, écriture catalogue:modifier. */
export const createStaffPromoCodesService = (promoCodes: PromoCodesRepository, now: () => Date = () => new Date()) => {
  function require(actor: Grantee, write: boolean) {
    if (!can(actor, write ? 'catalogue:modifier' : 'catalogue:consulter')) throw new ForbiddenError();
  }

  return {
    async list(query: ListPromoCodesQuery, actor: Grantee) {
      require(actor, false);
      const { items, total } = await promoCodes.list(query);
      return paginate(items.map(toDto), total, query.page, query.limit);
    },

    async get(id: string, actor: Grantee) {
      require(actor, false);
      const found = await promoCodes.findById(id);
      if (!found) throw new NotFoundError('Code introuvable.');
      return toDto(found);
    },

    async create(input: CreatePromoCodeInput, actor: Grantee) {
      require(actor, true);
      const created = await promoCodes.create({
        ...input,
        code: normalizeCode(input.code),
        startsAt: now(),
      });
      if (!created) throw new ConflictError(CODE_TAKEN);
      return toDto(created);
    },

    /** Les règles portent sur le code tel qu'il sera : valeurs envoyées complétées par les valeurs actuelles. */
    async update(id: string, input: UpdatePromoCodeInput, actor: Grantee) {
      require(actor, true);
      const current = await promoCodes.findById(id);
      if (!current) throw new NotFoundError('Code introuvable.');
      const next = { ...current, ...input };
      if (next.type === 'percent' && next.value > 100)
        throw new UnprocessableError('Un pourcentage ne dépasse pas 100.');
      if (next.value === 0 && !next.freeDelivery)
        throw new UnprocessableError('Une réduction de 0 n’est possible que pour la livraison offerte.');
      if (next.startsAt >= next.endsAt) throw new UnprocessableError('La fin doit suivre le début.');
      if (next.maxUses !== null && next.maxUses < current.uses)
        throw new UnprocessableError(
          `Le code a déjà servi ${current.uses} fois : la limite ne peut pas être plus basse.`,
        );
      const updated = await promoCodes.update(id, input.code ? { ...input, code: normalizeCode(input.code) } : input);
      if (updated === undefined) throw new NotFoundError('Code introuvable.');
      if (updated === null) throw new ConflictError(CODE_TAKEN);
      return toDto(updated);
    },
  };
};

export type StaffPromoCodesService = ReturnType<typeof createStaffPromoCodesService>;
