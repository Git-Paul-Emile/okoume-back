import { toOrderDto, type OrderDto } from '../orders/orders.dto.js';
import type { OrderRecord } from '../orders/orders.repository.js';

/** Vue de l'équipe : la vue client, plus le compte rattaché et l'auteur de chaque étape. */
export interface StaffOrderDto extends Omit<OrderDto, 'history'> {
  customerId: string | null;
  courierId: string | null;
  deliveryCost: number | null;
  /** Vérification anti-fraude (19.3), visible de l'équipe seulement : jamais dans la vue du client */
  review: {
    status: 'pending' | 'cleared';
    reasons: string[];
    note: string | null;
    by: string | null;
    at: string | null;
  } | null;
  history: Array<OrderDto['history'][number] & { by?: string; actor: OrderRecord['events'][number]['actor'] }>;
}

export const toStaffOrderDto = (o: OrderRecord): StaffOrderDto => {
  const base = toOrderDto(o);
  return {
    ...base,
    customerId: o.customerId,
    courierId: o.courierId,
    deliveryCost: o.deliveryCost,
    review: o.review ? { ...o.review, at: o.review.at?.toISOString() ?? null } : null,
    history: base.history.map((step, i) => {
      const event = o.events[i];
      return { ...step, actor: event?.actor ?? 'system', ...(event?.by ? { by: event.by } : {}) };
    }),
  };
};
