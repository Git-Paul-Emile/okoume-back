import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../core/errors/AppError.js';
import { paginate } from '../../core/http/apiResponse.js';
import { parseSort } from '../../core/validation/common.schemas.js';
import { can, type Grantee, type Permission } from '../../core/security/permissions.js';
import type { EmailMessage, EmailSender } from '../../infrastructure/email/emailSender.js';
import type { Notifier } from '../notifications/notifier.js';
import { orderStatusMessage } from '../notifications/notifications.rules.js';
import { logger } from '../../lib/logger.js';
import type { OrderRecord, OrdersRepository } from '../orders/orders.repository.js';
import type { StaffZonesRepository } from '../staff-delivery-zones/staff-delivery-zones.repository.js';
import type { CouriersRepository } from '../staff-couriers/staff-couriers.repository.js';
import { courierAssignmentEmail, feeChangeEmail, shippingEmail } from './staff-orders.emails.js';
import {
  advancePlan,
  assignCourierPlan,
  cancelPlan,
  deliveryRetryPlan,
  reopenPlan,
  type TransitionPlan,
} from '../orders/orders.transitions.js';
import { toStaffOrderDto } from './staff-orders.dto.js';
import type {
  CancellationDecisionInput,
  FeeChangeInput,
  ListStaffOrdersQuery,
  TransitionInput,
} from './staff-orders.schemas.js';

export type StaffActor = Grantee & { id: string };

/** Droit exigé par action (cahier des charges, 2.4) ; vérifié ici, jamais seulement dans l'interface. */
const REQUIRED: Record<TransitionInput['action'], Permission> = {
  advance: 'commandes:modifier',
  assign_courier: 'commandes:modifier',
  cancel: 'commandes:annuler',
  reopen: 'commandes:valider',
  delivery_failed: 'commandes:modifier',
};

const STALE = 'La commande a changé entre-temps : rechargez-la avant de continuer.';

export interface StaffOrdersDependencies {
  orders: OrdersRepository;
  couriers: CouriersRepository;
  zones: StaffZonesRepository;
  email: EmailSender;
  notifier: Notifier;
  appUrl: string;
  now: () => Date;
}

export const createStaffOrdersService = ({
  orders,
  couriers,
  zones,
  email,
  notifier,
  appUrl,
  now,
}: StaffOrdersDependencies) => {
  async function load(id: string) {
    const order = await orders.findById(id);
    if (!order) throw new NotFoundError('Commande introuvable.');
    return order;
  }

  /** Livreur actif du répertoire ; le coût réel par défaut est le coût habituel de la zone (9.5). */
  async function courierFor(order: OrderRecord, courierId: string, deliveryCost: number | undefined) {
    const courier = await couriers.findById(courierId);
    if (!courier?.active) throw new UnprocessableError('Ce livreur n’est pas disponible dans le répertoire.');
    const zoneCost = (await zones.findAll()).find((z) => z.id === order.zoneId)?.courierCost ?? null;
    return { courier, plan: { id: courier.id, deliveryCost: deliveryCost ?? order.deliveryCost ?? zoneCost } };
  }

  /** Les e-mails partent après l'écriture : un échec de dépôt ne défait pas l'étape enregistrée. */
  async function notify(message: EmailMessage, orderId: string) {
    try {
      await email.send(message);
    } catch (err) {
      logger.error({ err, orderId }, 'E-mail de livraison non déposé');
    }
  }

  /** Étape suivie par le client sur son téléphone (10.2) ; une commande sans compte n'a pas d'appareil abonné. */
  async function notifyCustomer(order: OrderRecord) {
    const message = orderStatusMessage(order, order.status, appUrl);
    if (order.customerId && message) await notifier.notifyCustomer(order.customerId, 'orders', message);
  }

  return {
    async list(query: ListStaffOrdersQuery, actor: Grantee) {
      // Contrôle aussi dans le service : la route n'est pas le seul appelant possible (security.md)
      if (!can(actor, 'commandes:consulter')) throw new ForbiddenError();
      const sort = parseSort(query.sort);
      const { items, total } = await orders.listForStaff({
        status: query.status,
        review: query.review,
        paymentMethod: query.paymentMethod,
        paymentStatus: query.paymentStatus,
        search: query.search,
        sort: sort
          ? { field: sort.field === 'total' ? 'total' : 'createdAt', direction: sort.direction }
          : { field: 'createdAt', direction: 'desc' },
        page: query.page,
        limit: query.limit,
      });
      return paginate(items.map(toStaffOrderDto), total, query.page, query.limit);
    },

    get: async (id: string) => toStaffOrderDto(await load(id)),

    /** Commande signalée vérifiée : la note dit ce qui a été contrôlé ; la préparation devient possible. */
    async clearReview(id: string, note: string, actor: StaffActor) {
      if (!can(actor, 'commandes:valider')) throw new ForbiddenError();
      const order = await load(id);
      if (!(await orders.clearReview(order.id, { note, staffId: actor.id, at: now() })))
        throw new ConflictError('Cette commande n’attend pas de vérification.');
      return toStaffOrderDto(await load(id));
    },

    /**
     * Changement d'état par l'équipe. La règle (orders.transitions.ts) décide de l'état suivant et de
     * l'effet sur le stock ; le dépôt l'applique seulement si personne n'a modifié la commande entre-temps.
     */
    async transition(id: string, input: TransitionInput, actor: StaffActor) {
      if (!can(actor, REQUIRED[input.action])) throw new ForbiddenError();
      const order = await load(id);
      let assigned: Awaited<ReturnType<typeof courierFor>> | null = null;
      let plan: TransitionPlan;
      switch (input.action) {
        case 'advance':
          // Commande signalée : la préparation attend la vérification d'un membre de l'équipe (19.3)
          if (order.status === 'confirmed' && order.review?.status === 'pending')
            throw new ConflictError('Commande à vérifier : validez-la avant de commencer la préparation.');
          plan = advancePlan(order, input.note);
          break;
        case 'assign_courier':
          assigned = await courierFor(order, input.courierId, input.deliveryCost);
          plan = assignCourierPlan(order, assigned.plan);
          break;
        case 'cancel':
          plan = cancelPlan(order, `Annulée par la boutique : ${input.reason}`);
          break;
        case 'reopen':
          plan = reopenPlan(order, input.reason);
          break;
        case 'delivery_failed':
          plan =
            input.decision === 'retry'
              ? deliveryRetryPlan(order, input.reason)
              : cancelPlan(order, `Annulée par la boutique : échec de livraison (${input.reason})`);
          break;
      }
      const result = await orders.applyTransition(order, plan, { type: 'staff', staffId: actor.id });
      if (result.outcome === 'stale') throw new ConflictError(STALE);
      const updated = result.order;
      if (assigned?.courier.email)
        await notify(
          courierAssignmentEmail(updated, { ...assigned.courier, email: assigned.courier.email }),
          updated.id,
        );
      if (plan.to === 'shipping' && updated.courierId) {
        const courier = await couriers.findById(updated.courierId);
        if (courier) await notify(shippingEmail(updated, courier), updated.id);
      }
      await notifyCustomer(updated);
      return toStaffOrderDto(updated);
    },

    async setDeliveryCost(id: string, amount: number, actor: StaffActor) {
      if (!can(actor, 'commandes:modifier')) throw new ForbiddenError();
      const updated = await orders.setDeliveryCost(id, amount);
      if (!updated) throw new NotFoundError('Commande introuvable.');
      return toStaffOrderDto(updated);
    },

    /**
     * Nouveaux frais facturés (9.5) : proposés au client, appliqués seulement avec son accord. Possible tant que
     * rien n'est encaissé et que la commande n'est pas en route ; la livraison attend la réponse.
     */
    async proposeFeeChange(id: string, input: FeeChangeInput, actor: StaffActor) {
      if (!can(actor, 'commandes:modifier')) throw new ForbiddenError();
      const order = await load(id);
      if (['shipping', 'delivered', 'cancelled', 'claim'].includes(order.status))
        throw new ConflictError('Les frais ne peuvent plus être modifiés à ce stade.');
      if (order.paymentStatus !== 'awaiting_payment')
        throw new ConflictError('Commande déjà encaissée : les frais facturés ne peuvent plus changer.');
      if (input.toFee === order.totals.deliveryFee - order.totals.deliveryDiscount)
        throw new UnprocessableError('Le montant proposé est identique aux frais actuels.');
      if (!(await orders.proposeFeeChange(order, { ...input, staffId: actor.id })))
        throw new ConflictError('Une demande de changement des frais attend déjà la réponse du client.');
      await notify(feeChangeEmail(order, input.toFee, input.reason, appUrl), order.id);
      return toStaffOrderDto(await load(id));
    },

    async resolveDispute(id: string, resolution: string, actor: StaffActor) {
      if (!can(actor, 'commandes:modifier')) throw new ForbiddenError();
      await load(id);
      if (!(await orders.resolveDispute(id, resolution, actor.id, now())))
        throw new ConflictError('Aucune contestation ouverte sur cette commande.');
      return toStaffOrderDto(await load(id));
    },

    /** Décision sur une demande d'annulation du client ; acceptée, l'annulation suit la règle habituelle. */
    async decideCancellation(id: string, input: CancellationDecisionInput, actor: StaffActor) {
      if (!can(actor, 'commandes:annuler')) throw new ForbiddenError();
      const order = await load(id);
      if (order.cancellation?.status !== 'pending') throw new ConflictError('Aucune demande d’annulation en attente.');
      const accept = input.status === 'accepted';
      const plan = accept ? cancelPlan(order, `Annulée à la demande du client (${order.cancellation.reason})`) : null;
      const result = await orders.decideCancellation(
        order,
        { accept, reason: input.decisionReason, staffId: actor.id, at: now() },
        plan,
      );
      if (result.outcome === 'stale') throw new ConflictError(STALE);
      if (accept) await notifyCustomer(result.order);
      return toStaffOrderDto(result.order);
    },
  };
};

export type StaffOrdersService = ReturnType<typeof createStaffOrdersService>;
