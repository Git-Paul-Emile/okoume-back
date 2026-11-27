import { toOrderDto, type OrderDto } from '../orders/orders.dto.js';
import type { OrderRecord } from '../orders/orders.repository.js';

/** Vue de l'équipe : la vue client, plus le compte rattaché et l'auteur de chaque étape. */
export interface StaffOrderDto extends Omit<OrderDto, 'history'> {
  customerId: string | null;
  courierId: string | null;
  deliveryCost: number | null;
  history: Array<OrderDto['history'][number] & { by?: string; actor: OrderRecord['events'][number]['actor'] }>;
}

export const toStaffOrderDto = (o: OrderRecord): StaffOrderDto => {
  const base = toOrderDto(o);
  return {
    ...base,
    customerId: o.customerId,
    courierId: o.courierId,
    deliveryCost: o.deliveryCost,
    history: base.history.map((step, i) => {
      const event = o.events[i];
      return { ...step, actor: event?.actor ?? 'system', ...(event?.by ? { by: event.by } : {}) };
    }),
  };
};
