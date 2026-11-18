import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, isOwner, type Grantee, type Permission } from '../../core/security/permissions.js';
import { fcfa } from '../../core/text/fcfa.js';
import type { OrdersRepository } from '../orders/orders.repository.js';
import { toStaffReturnDto } from '../returns/returns.dto.js';
import type { ReturnRecord, ReturnsRepository } from '../returns/returns.repository.js';
import { assertInspection, returnRefundAmount } from '../returns/returns.rules.js';
import type {
  InspectionInput,
  ListStaffReturnsQuery,
  ReturnDecisionInput,
  WriteOffInput,
} from './staff-returns.schemas.js';

export type ReturnActor = Grantee & { id: string };

const STALE = 'Le dossier a changé entre-temps : rechargez-le avant de continuer.';
const CLOCK_SKEW_MS = 60_000;

export const createStaffReturnsService = (returns: ReturnsRepository, orders: OrdersRepository, now: () => Date) => {
  function require(actor: Grantee, permission: Permission) {
    if (!can(actor, permission)) throw new ForbiddenError();
  }

  async function load(id: string) {
    const ret = await returns.findById(id);
    if (!ret) throw new NotFoundError('Dossier de retour introuvable.');
    return ret;
  }

  function atStep(ret: ReturnRecord, expected: ReturnRecord['status'], message: string) {
    if (ret.status !== expected) throw new ConflictError(message);
  }

  const done = (ret: ReturnRecord | null) => {
    if (!ret) throw new ConflictError(STALE);
    return toStaffReturnDto(ret);
  };

  return {
    async list(query: ListStaffReturnsQuery, actor: Grantee) {
      require(actor, 'retours:consulter');
      const { items, total } = await returns.list(query);
      return paginate(items.map(toStaffReturnDto), total, query.page, query.limit);
    },

    async get(id: string, actor: Grantee) {
      require(actor, 'retours:consulter');
      return toStaffReturnDto(await load(id));
    },

    /** Seul l'administrateur principal accepte ou refuse un retour (14.3, 28.6) : droit retours:valider. */
    async decide(id: string, input: ReturnDecisionInput, actor: ReturnActor) {
      require(actor, 'retours:valider');
      const ret = await load(id);
      atStep(ret, 'pending', 'Ce dossier n’attend pas de décision.');
      const staff = { type: 'staff' as const, staffId: actor.id };
      if (input.status === 'refused')
        return done(
          await returns.transition(
            ret,
            'refused',
            { decisionReason: input.decisionReason },
            `Retour refusé : ${input.decisionReason}`,
            staff,
          ),
        );
      const payer = input.shippingPaidBy === 'shop' ? 'la boutique' : 'le client';
      return done(
        await returns.transition(
          ret,
          'expected',
          {
            decisionReason: input.decisionReason,
            shippingPaidBy: input.shippingPaidBy,
            shippingReason: input.shippingReason,
          },
          `Retour accepté, frais de retour à la charge de ${payer} (${input.shippingReason}). Retour attendu.`,
          staff,
        ),
      );
    },

    async receive(id: string, actor: ReturnActor) {
      require(actor, 'retours:modifier');
      const ret = await load(id);
      atStep(ret, 'expected', 'Ce retour n’est pas attendu.');
      return done(await returns.transition(ret, 'received', {}, 'Produit reçu', { type: 'staff', staffId: actor.id }));
    },

    /**
     * Inspection après réception (14.3). Conforme : articles classés, non revendables mis à part, montant à
     * rembourser fixé ; la commande payée passe en « Remboursement à effectuer ». Rien n'est remboursé avant.
     */
    async inspect(id: string, input: InspectionInput, actor: ReturnActor) {
      require(actor, 'retours:modifier');
      const ret = await load(id);
      atStep(ret, 'received', 'Le colis doit avoir été reçu pour être inspecté.');
      const staff = { type: 'staff' as const, staffId: actor.id };
      if (input.outcome === 'non_conforming')
        return done(await returns.transition(ret, 'closed', {}, `Inspection non conforme : ${input.note}`, staff));

      assertInspection(ret.items, input.lines);
      const order = await orders.findById(ret.orderId);
      if (!order) throw new NotFoundError('Commande introuvable.');
      const paid = order.paymentStatus === 'paid';
      const refundAmount = paid ? returnRefundAmount(order, ret.items) : 0;
      const next = refundAmount > 0 ? 'refund_due' : 'closed';
      const note =
        next === 'refund_due'
          ? `Inspection conforme : remboursement à effectuer de ${fcfa(refundAmount)}${input.note ? `. ${input.note}` : ''}`
          : `Inspection conforme, rien à rembourser (aucun encaissement enregistré)${input.note ? `. ${input.note}` : ''}`;
      return done(
        await returns.inspect(
          ret,
          { lines: input.lines, note, refundAmount, next, orderRefundDue: next === 'refund_due' },
          actor.id,
        ),
      );
    },

    /** Remise en stock des revendables : inspection faite, validation d'une personne autorisée au stock (14.3). */
    async restock(id: string, actor: ReturnActor) {
      require(actor, 'stock:valider');
      const ret = await load(id);
      if (ret.restockStatus !== 'pending')
        throw new ConflictError('Aucune remise en stock en attente pour ce dossier.');
      return done(await returns.restock(ret, actor.id));
    },

    /** Sortie définitive du stock non revendable : décision de l'administrateur principal uniquement (14.3). */
    async writeOff(variantId: string, input: WriteOffInput, actor: ReturnActor) {
      if (!isOwner(actor)) throw new ForbiddenError('Seul l’administrateur principal décide d’une sortie définitive.');
      if (input.occurredAt.getTime() > now().getTime() + CLOCK_SKEW_MS)
        throw new UnprocessableError('La date ne peut pas être dans le futur.');
      const result = await returns.writeOff(variantId, input, actor.id);
      if (result.outcome === 'not_found') throw new NotFoundError('Variante introuvable.');
      if (result.outcome === 'insufficient')
        throw new ConflictError(
          `Seulement ${result.unsellable} article${result.unsellable > 1 ? 's' : ''} en stock non revendable.`,
        );
      return { unsellable: result.unsellableLeft };
    },
  };
};

export type StaffReturnsService = ReturnType<typeof createStaffReturnsService>;
