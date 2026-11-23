import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { can, type Grantee, type Permission } from '../../core/security/permissions.js';
import { fcfa } from '../../core/text/fcfa.js';
import type { OrdersRepository } from '../orders/orders.repository.js';
import { toStaffReturnDto } from '../returns/returns.dto.js';
import type { ReturnRecord, ReturnsRepository } from '../returns/returns.repository.js';
import { returnRefundAmount } from '../returns/returns.rules.js';
import type {
  ListStaffReturnsQuery,
  ReturnDecisionInput,
} from './staff-returns.schemas.js';

export type ReturnActor = Grantee & { id: string };

const STALE = 'Le dossier a changé entre-temps : rechargez-le avant de continuer.';
export const createStaffReturnsService = (returns: ReturnsRepository, orders: OrdersRepository) => {
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
      if (ret.status !== 'expected' && ret.status !== 'received')
        throw new ConflictError('Ce retour n’attend pas de réception.');
      const order = await orders.findById(ret.orderId);
      if (!order) throw new NotFoundError('Commande introuvable.');
      const paid = order.paymentStatus === 'paid';
      const refundAmount = paid ? returnRefundAmount(order, ret.items) : 0;
      const next = refundAmount > 0 ? 'refund_due' : 'closed';
      const note = next === 'refund_due'
        ? `Retour reçu : remboursement à effectuer de ${fcfa(refundAmount)}`
        : 'Retour reçu, aucun remboursement à effectuer';
      return done(await returns.receive(ret, { refundAmount, next, note }, actor.id));
    },
  };
};

export type StaffReturnsService = ReturnType<typeof createStaffReturnsService>;
